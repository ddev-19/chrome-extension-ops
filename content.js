(function () {
  if (window.__dpIdentifierActive) return;
  window.__dpIdentifierActive = true;

  console.log('[DP] ✅ Content script loaded on:', location.href);

  const TYPE_COLORS = {
    'Sportan':               { bg: '#dcfce7', border: '#22c55e', text: '#15803d' },
    'DreamPlay Employee':    { bg: '#dbeafe', border: '#3b82f6', text: '#1d4ed8' },
    'Ex-Sportan':            { bg: '#ffedd5', border: '#f97316', text: '#c2410c' },
    'Ex-DreamPlay Employee': { bg: '#f3e8ff', border: '#a855f7', text: '#7e22ce' },
    'Test UserID':           { bg: '#fee2e2', border: '#ef4444', text: '#b91c1c' },
    'Unknown':               { bg: '#f1f5f9', border: '#94a3b8', text: '#475569' },
  };

  let isEnabled = true;
  let highlightTimer = null;
  let rowObserver = null;

  // Show a floating badge on the page so you can visually confirm injection
  function showStatusBadge(text, color) {
    let badge = document.getElementById('dp-status-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'dp-status-badge';
      badge.style.cssText = `
        position: fixed; bottom: 16px; right: 16px; z-index: 99999;
        padding: 6px 12px; border-radius: 20px;
        font-size: 12px; font-weight: 600; font-family: sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        transition: opacity 0.5s;
        pointer-events: none;
      `;
      document.body.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.background = color;
    badge.style.color = '#fff';
    badge.style.opacity = '1';

    // Fade out after 3 seconds
    clearTimeout(badge._fadeTimer);
    badge._fadeTimer = setTimeout(() => { badge.style.opacity = '0'; }, 3000);
  }

  // ── Check enabled state ────────────────────────────────────
  chrome.storage.sync.get(['enabled'], (data) => {
    isEnabled = data.enabled !== false;
    console.log('[DP] Enabled state:', isEnabled);
    if (isEnabled) {
      showStatusBadge('🔍 DreamPlay Identifier: Active', '#6366f1');
      init();
    } else {
      showStatusBadge('⏸ DreamPlay Identifier: Off', '#64748b');
    }
  });

  // ── Listen for toggle from popup ───────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    console.log('[DP] Message from popup:', message.type);
    if (message.type === 'DP_ENABLE') {
      isEnabled = true;
      showStatusBadge('🔍 DreamPlay Identifier: Active', '#6366f1');
      init();
    }
    if (message.type === 'DP_DISABLE') {
      isEnabled = false;
      stopObserver();
      clearHighlights();
      showStatusBadge('⏸ DreamPlay Identifier: Off', '#64748b');
    }
  });

  // ── Init: wait for table, attach observer ──────────────────
  function init() {
    console.log('[DP] Init — waiting for table...');
    waitForElement('tbody', (tbody) => {
      console.log('[DP] tbody found! Rows:', tbody.querySelectorAll('tr').length);
      attachObserver(tbody);
      runHighlight();
    });
  }

  // ── Poll for element with retries ──────────────────────────
  function waitForElement(selector, callback, maxWait = 15000) {
    const el = document.querySelector(selector);
    if (el) { callback(el); return; }

    const start = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(interval);
        callback(el);
      } else if (Date.now() - start > maxWait) {
        clearInterval(interval);
        console.warn('[DP] Timed out waiting for', selector);
      }
    }, 300);
  }

  // ── Observe tbody rows for pagination/filter changes ───────
  function attachObserver(tbody) {
    stopObserver();
    rowObserver = new MutationObserver(() => {
      clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => {
        console.log('[DP] Table rows changed — re-highlighting');
        runHighlight();
      }, 400);
    });
    rowObserver.observe(tbody, { childList: true });
    console.log('[DP] Observer attached to tbody');
  }

  function stopObserver() {
    if (rowObserver) { rowObserver.disconnect(); rowObserver = null; }
    clearTimeout(highlightTimer);
  }

  // ── Core: fetch from API and highlight ─────────────────────
  function runHighlight() {
    if (!isEnabled) return;

    chrome.storage.sync.get(['apiUrl', 'apiKey'], (data) => {
      if (!data.apiUrl || !data.apiKey) {
        console.warn('[DP] API URL or Key not set — open extension popup and save settings');
        showStatusBadge('⚠️ Set API URL & Key in extension', '#f97316');
        return;
      }

      const colIndex = getUserIdColIndex();
      if (colIndex === -1) {
        console.warn('[DP] USER ID column not found in table headers');
        // Log what headers were found to help debug
        const headers = Array.from(document.querySelectorAll('th')).map(h => h.textContent.trim());
        console.log('[DP] Headers found:', headers);
        return;
      }

      const userids = extractUserIds(colIndex);
      if (userids.length === 0) {
        console.warn('[DP] No user IDs found in column', colIndex);
        return;
      }

      console.log('[DP] Identifying userids:', userids);
      showStatusBadge('⏳ Identifying...', '#6366f1');

      chrome.runtime.sendMessage(
        { type: 'IDENTIFY_USERS', userids, apiUrl: data.apiUrl, apiKey: data.apiKey },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[DP] Runtime error:', chrome.runtime.lastError.message);
            showStatusBadge('❌ Extension error', '#ef4444');
            return;
          }
          if (response?.error) {
            console.error('[DP] API error:', response.error);
            showStatusBadge(`❌ ${response.error}`, '#ef4444');
            return;
          }
          if (response?.results) {
            applyHighlights(response.results, colIndex);
            showStatusBadge(`✅ ${response.results.length} users identified`, '#22c55e');
          }
        }
      );
    });
  }

  // ── DOM Helpers ────────────────────────────────────────────
  function getUserIdColIndex() {
    const headers = Array.from(document.querySelectorAll('th'));
    let colIndex = -1;
    headers.forEach((th, i) => {
      const text = th.textContent.trim().toUpperCase().replace(/\s+/g, ' ');
      if (text.includes('USER') && text.includes('ID')) colIndex = i;
    });
    return colIndex;
  }

  function extractUserIds(colIndex) {
    return Array.from(document.querySelectorAll('tbody tr'))
      .map(row => row.querySelectorAll('td')[colIndex]?.textContent.trim())
      .filter(Boolean);
  }

  function applyHighlights(results, colIndex) {
    const infoMap = {};
    results.forEach(r => { infoMap[r.userid] = r; });

    Array.from(document.querySelectorAll('tbody tr')).forEach(row => {
      const cells = row.querySelectorAll('td');
      if (!cells[colIndex]) return;

      const cell   = cells[colIndex];
      const userid = cell.textContent.trim();
      if (!userid) return;

      const info   = infoMap[userid] || { name: '-', userType: 'Unknown' };
      const colors = TYPE_COLORS[info.userType] || TYPE_COLORS['Unknown'];

      cell.querySelector('.dp-badge')?.remove();
      cell.style.background   = colors.bg;
      cell.style.borderLeft   = `3px solid ${colors.border}`;
      cell.style.padding      = '6px 8px';
      cell.style.borderRadius = '4px';

      const badge = document.createElement('div');
      badge.className = 'dp-badge';
      badge.style.cssText = `font-size:10px; color:${colors.text}; font-weight:600; margin-top:3px; line-height:1.4; pointer-events:none;`;
      badge.innerHTML = `<div>${info.userType}</div><div style="font-weight:400;color:#64748b">${info.name}</div>`;
      cell.appendChild(badge);
    });
  }

  function clearHighlights() {
    document.querySelectorAll('.dp-badge').forEach(el => el.remove());
    document.querySelectorAll('tbody td').forEach(cell => {
      cell.style.background = cell.style.borderLeft = cell.style.padding = cell.style.borderRadius = '';
    });
  }

})();
