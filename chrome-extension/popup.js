document.addEventListener('DOMContentLoaded', async () => {
  const recordToggle   = document.getElementById('record-toggle');
  const recordText     = document.getElementById('record-text');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText     = document.getElementById('status-text');
  const timerEl        = document.getElementById('recording-timer');
  const uploadStatusEl = document.getElementById('upload-status');
  const optionsBtn     = document.getElementById('options-btn');

  let timerInterval = null;

  // ── Options button ──────────────────────────────────────────────────────────
  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // ── Initial state sync ──────────────────────────────────────────────────────
  // Use the new 'get-state' message which returns both isRecording AND
  // recordingStartTime so the timer can resume correctly if the popup is
  // reopened mid-recording.
  chrome.runtime.sendMessage({ type: 'get-state' }, (response) => {
    if (chrome.runtime.lastError) return; // SW may be waking up; ignore
    applyRecordingState(response?.isRecording, response?.recordingStartTime);
  });

  // Also read upload status from storage on load
  const { uploadStatus, uploadError } = await chrome.storage.local.get(['uploadStatus', 'uploadError']);
  applyUploadStatus(uploadStatus, uploadError);

  // ── Live updates via storage.onChanged ─────────────────────────────────────
  // background.js writes all state changes to chrome.storage.local, so this
  // listener keeps the popup perfectly in sync even if it was already open.
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.isRecording || changes.recordingStartTime) {
      const isRec    = changes.isRecording?.newValue;
      const startTime = changes.recordingStartTime?.newValue;
      applyRecordingState(isRec, startTime);
    }
    if (changes.uploadStatus || changes.uploadError) {
      applyUploadStatus(
        changes.uploadStatus?.newValue,
        changes.uploadError?.newValue
      );
    }
  });

  // ── Toggle button ───────────────────────────────────────────────────────────
  recordToggle.addEventListener('click', () => {
    recordToggle.disabled = true; // Prevent double-clicks during async toggle

    chrome.runtime.sendMessage({ type: 'toggle-recording' }, (response) => {
      recordToggle.disabled = false;
      applyRecordingState(response?.isRecording, response?.recordingStartTime);
      // Close popup after starting so the 'REC' badge on the icon is visible
      if (response?.isRecording) setTimeout(() => window.close(), 400);
    });
  });

  // ── UI state functions ──────────────────────────────────────────────────────

  function applyRecordingState(isRecording, startTime) {
    recordToggle.classList.toggle('recording', !!isRecording);
    statusIndicator.classList.toggle('active', !!isRecording);
    recordText.textContent   = isRecording ? 'Stop Recording' : 'Start Recording';
    statusText.textContent   = isRecording ? 'Recording in progress' : 'Ready to record';

    // Timer: start or clear
    clearInterval(timerInterval);

    if (isRecording && startTime) {
      timerEl.style.display = 'block';
      updateTimer(startTime); // Immediately render, then tick every second
      timerInterval = setInterval(() => updateTimer(startTime), 1000);
    } else {
      timerEl.style.display = 'none';
      timerEl.textContent = '00:00';
    }
  }

  function updateTimer(startTime) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    timerEl.textContent = h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function applyUploadStatus(status, errorMsg) {
    if (status === 'error') {
      uploadStatusEl.textContent = errorMsg || 'Upload failed — check Settings';
      uploadStatusEl.className = 'upload-status error';
    } else if (status === 'ok') {
      uploadStatusEl.textContent = '✓ Last upload successful';
      uploadStatusEl.className = 'upload-status ok';
    } else {
      uploadStatusEl.textContent = '';
      uploadStatusEl.className = 'upload-status';
    }
  }
});
