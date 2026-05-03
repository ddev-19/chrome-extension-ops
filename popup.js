document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('masterToggle');
  const status = document.getElementById('status');

  // Load saved settings
  chrome.storage.sync.get(['apiUrl', 'apiKey', 'enabled'], (data) => {
    if (data.apiUrl) document.getElementById('apiUrl').value = data.apiUrl;
    if (data.apiKey) document.getElementById('apiKey').value = data.apiKey;

    const isEnabled = data.enabled !== false; // default ON
    toggle.checked = isEnabled;
    updateStatus(isEnabled);
  });

  // Toggle ON/OFF
  toggle.addEventListener('change', () => {
    const isEnabled = toggle.checked;
    chrome.storage.sync.set({ enabled: isEnabled });
    updateStatus(isEnabled);

    // Tell the content script on the active tab to start/stop
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: isEnabled ? 'DP_ENABLE' : 'DP_DISABLE' });
      }
    });
  });

  // Save settings
  document.getElementById('saveSettings').addEventListener('click', () => {
    const apiUrl = document.getElementById('apiUrl').value.trim().replace(/\/$/, '');
    const apiKey = document.getElementById('apiKey').value.trim();
    chrome.storage.sync.set({ apiUrl, apiKey }, () => {
      status.textContent = '✅ Settings saved!';
      status.className = 'status on';
      setTimeout(() => updateStatus(toggle.checked), 1500);
    });
  });

  function updateStatus(isEnabled) {
    if (isEnabled) {
      status.textContent = '🟢 Active — auto-identifying on every page';
      status.className = 'status on';
    } else {
      status.textContent = 'Turned off — toggle to activate';
      status.className = 'status off';
    }
  }
});
