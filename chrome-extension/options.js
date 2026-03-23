document.addEventListener('DOMContentLoaded', async () => {
  const serverUrlInput = document.getElementById('server-url');
  const apiKeyInput    = document.getElementById('api-key');
  const saveBtn        = document.getElementById('save-btn');
  const saveStatus     = document.getElementById('save-status');

  // ── Load existing config ────────────────────────────────────────────────────
  const { apiKey = '', serverUrl = 'http://localhost:3000' } =
    await chrome.storage.local.get(['apiKey', 'serverUrl']);

  serverUrlInput.value = serverUrl;

  // Don't pre-fill the API key value for security — just signal that one is set.
  // The placeholder text makes it clear the user only needs to type if changing it.
  if (apiKey) {
    apiKeyInput.placeholder = `Key set — leave blank to keep (${apiKey.length} chars)`;
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  saveBtn.addEventListener('click', async () => {
    const url = serverUrlInput.value.trim();
    const key = apiKeyInput.value.trim();

    if (!url) {
      showStatus('Server URL is required.', 'error');
      return;
    }

    // Validate URL format loosely
    try { new URL(url); } catch (_) {
      showStatus('Invalid URL format. Include http:// or https://', 'error');
      return;
    }

    const update = { serverUrl: url };
    // Only overwrite the stored API key if the user actually typed a new one
    if (key) update.apiKey = key;

    await chrome.storage.local.set(update);

    // Clear the key field after saving — avoid leaving the key visible
    apiKeyInput.value = '';
    if (update.apiKey) {
      apiKeyInput.placeholder = `Key set — leave blank to keep (${update.apiKey.length} chars)`;
    }

    showStatus('Settings saved.', 'ok');
  });

  // ── Status helper ───────────────────────────────────────────────────────────
  function showStatus(msg, type) {
    saveStatus.textContent = msg;
    saveStatus.className = `options-save-status ${type}`;
    setTimeout(() => {
      saveStatus.textContent = '';
      saveStatus.className = 'options-save-status';
    }, 3000);
  }
});
