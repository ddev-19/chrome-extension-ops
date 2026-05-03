// background.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'IDENTIFY_USERS') {
    const { userids, apiUrl, apiKey } = message;

    console.log('[DP Background] Calling API for userids:', userids);

    fetch(`${apiUrl}/api/v1/identify/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify({ userids })
    })
    .then(res => {
      if (!res.ok) throw new Error(`API returned ${res.status}`);
      return res.json();
    })
    .then(results => {
      console.log('[DP Background] API results:', results);
      sendResponse({ results });
    })
    .catch(err => {
      console.error('[DP Background] Fetch error:', err.message);
      sendResponse({ error: err.message });
    });

    return true;
  }
});
