// ─── State ────────────────────────────────────────────────────────────────────

let isRecording = false;
let recordingStartTime = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const { isRecording: stored, recordingStartTime: storedStart } =
    await chrome.storage.local.get(['isRecording', 'recordingStartTime']);

  if (stored) {
    isRecording = true;
    recordingStartTime = storedStart || null;
    updateBadge(true);
  }
} 


init();

// ─── Message Hub ──────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'get-state':
      sendResponse({ isRecording, recordingStartTime });
      break;

    case 'toggle-recording':
      handleToggle().then(state => sendResponse(state));
      return true; // Keep channel open for async response

    case 'audio-chunk':
      // msg.index lets us identify chunk 0 (the WebM header) — see handleAudioChunk
      handleAudioChunk(msg.data, msg.index);
      break;

    case 'offscreen-stopped':
      // FIX (race condition): Offscreen document confirms recorder.onstop has
      // fired and the final ondataavailable chunk has been forwarded. Only now
      // is it safe to upload — previously we uploaded immediately on stopRecording()
      // which meant the last chunk(s) hadn't arrived yet.
      onOffscreenStopped();
      break;

    case 'keep-alive':
      break; // Receipt is enough to keep the SW awake
  }
});

// Belt-and-suspenders: alarms can wake a suspended SW even between messages.
// The offscreen doc creates a 'keep-alive' alarm; background.js handles it here
// so the SW registers a listener (required for it to wake on the alarm).
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'keep-alive') { /* no-op — waking up is the point */ }
});

// ─── Toggle ───────────────────────────────────────────────────────────────────

async function handleToggle() {
  if (isRecording) {
    await stopRecording();
    return { isRecording: false, recordingStartTime: null };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return { isRecording: false, recordingStartTime: null };

  await startRecording(tab.id);
  return { isRecording: true, recordingStartTime };
}

// ─── Start / Stop ─────────────────────────────────────────────────────────────

async function startRecording(tabId) {
  try {
    // Clear chunks from any previous session before starting fresh
    await chrome.storage.local.set({
      audioChunks: [],
      uploadStatus: 'idle',
      uploadError: null
    });

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

    // FIX (incorrect optional chaining): The original `chrome.offscreen.hasDocument?.()`
    // would silently return undefined (falsy) if the method is absent, bypassing the
    // guard. A try/catch is the safe and spec-correct approach for MV3.
    let hasDoc = false;
    try { hasDoc = await chrome.offscreen.hasDocument(); } catch (_) { /* not present */ }

    if (!hasDoc) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Recording tab audio for transcription'
      });
      // Wait for offscreen document to initialize its message listener
      await new Promise(r => setTimeout(r, 500));
    }

    chrome.runtime.sendMessage({ type: 'start-offscreen', streamId });

    isRecording = true;
    recordingStartTime = Date.now();
    await chrome.storage.local.set({ isRecording: true, recordingStartTime });
    updateBadge(true);

  } catch (err) {
    console.error('startRecording failed:', err);
  }
}

async function stopRecording() {
  // Tell offscreen to stop. The actual upload runs in onOffscreenStopped()
  // once recorder.onstop fires and the last chunk has been sent here.
  chrome.runtime.sendMessage({ type: 'stop-offscreen' });

  isRecording = false;
  recordingStartTime = null;
  await chrome.storage.local.set({ isRecording: false, recordingStartTime: null });
  updateBadge(false);
}

async function onOffscreenStopped() {
  const { audioChunks = [] } = await chrome.storage.local.get('audioChunks');
  if (audioChunks.length > 0) await uploadChunks();
}

// ─── Audio Buffering ──────────────────────────────────────────────────────────

async function handleAudioChunk(base64Data, chunkIndex) {
  const { audioChunks = [] } = await chrome.storage.local.get('audioChunks');

  // Strip data-URL prefix to save storage space
  const clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  audioChunks.push(clean);

  // FIX (storage quota + silent failure): Hard cap on buffer length.
  // At 5s per chunk, 60 chunks ≈ 5 minutes. If we exceed this (upload failures
  // stacking up), we drop the oldest non-header chunks — chunk[0] is ALWAYS
  // preserved because it is the WebM EBML header required for valid playback.
  const MAX_CHUNKS = 60;
  if (audioChunks.length > MAX_CHUNKS) {
    console.warn('Audio buffer cap reached — dropping oldest non-header chunk');
    // Keep [0] (header) + newest (MAX_CHUNKS - 1) data chunks
    const trimmed = [audioChunks[0], ...audioChunks.slice(-(MAX_CHUNKS - 1))];
    await chrome.storage.local.set({ audioChunks: trimmed });
  } else {
    await chrome.storage.local.set({ audioChunks });
  }

  // Proactive flush every ~1 minute (12 chunks × 5s each)
  if (audioChunks.length >= 12) await uploadChunks();
}

// ─── Upload ───────────────────────────────────────────────────────────────────

async function uploadChunks() {
  const { audioChunks = [], apiKey, serverUrl = 'http://localhost:3000' } =
    await chrome.storage.local.get(['audioChunks', 'apiKey', 'serverUrl']);

  if (audioChunks.length === 0) return;

  if (!apiKey) {
    console.error('No API key — open Options to configure.');
    await setUploadStatus('error', 'API key not set. Open Options to configure.');
    return;
  }

  // ── Assemble valid WebM ──────────────────────────────────────────────────
  //
  // MediaRecorder produces a streaming WebM where:
  //   chunk[0]   = EBML header + Segment header + SeekHead + Info + Tracks
  //   chunk[1..] = Cluster elements (the actual audio data)
  //
  // To produce a standalone, playable WebM file you MUST prepend chunk[0]
  // to any cluster data. The original code did `chunks.join('')` before
  // decoding — this corrupts the file because base64 chunks cannot be
  // concatenated at the string level (the boundary bytes misalign the
  // encoding). Each chunk must be decoded to binary first, then the binary
  // arrays concatenated, then wrapped in a single Blob.
  //
  const byteArrays = audioChunks.map(b64 => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  });

  const totalLen = byteArrays.reduce((sum, a) => sum + a.length, 0);
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of byteArrays) { combined.set(arr, offset); offset += arr.length; }

  const blob = new Blob([combined], { type: 'audio/webm' });
  const form = new FormData();
  form.append('audio', blob, `rec_${Date.now()}.webm`);

  const ok = await uploadWithRetry(form, apiKey, serverUrl);

  if (ok) {
    // FIX (WebM header preservation): After a successful upload, retain
    // chunk[0] (the WebM EBML/Tracks header). New clusters appended after
    // this point still follow the same header, so the NEXT upload batch
    // will also be a valid standalone WebM file.
    const { audioChunks: latest } = await chrome.storage.local.get('audioChunks');
    const headerPreserved = latest.length > 0 ? [latest[0]] : [];
    await chrome.storage.local.set({ audioChunks: headerPreserved });
    await setUploadStatus('ok', null);

  } else {
    await setUploadStatus('error', 'Upload failed after 3 attempts. Audio is retained.');
  }
}

// ── Exponential backoff retry ─────────────────────────────────────────────────
// Attempts: 1 (immediate) → 2 (2s delay) → 3 (4s delay)
async function uploadWithRetry(formData, apiKey, serverUrl, maxAttempts = 3) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delayMs = 1000 * Math.pow(2, attempt - 1); // 2s, 4s
      await new Promise(r => setTimeout(r, delayMs));
    }
    try {
      const res = await fetch(`${serverUrl}/transcribe`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        body: formData
      });
      if (res.ok) return true;
      console.warn(`Upload attempt ${attempt + 1}/${maxAttempts} — HTTP ${res.status}`);
    } catch (err) {
      console.warn(`Upload attempt ${attempt + 1}/${maxAttempts} threw: ${err.message}`);
    }
  }
  console.error('All upload attempts failed. Audio retained in storage.');
  return false;
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function updateBadge(active) {
  chrome.action.setBadgeText({ text: active ? 'REC' : '' });
  chrome.action.setBadgeBackgroundColor({ color: active ? '#E74C3C' : '#888888' });
}

async function setUploadStatus(status, message) {
  // Writes to storage so popup.js (storage.onChanged) updates the UI live.
  await chrome.storage.local.set({ uploadStatus: status, uploadError: message });

  if (status === 'error') {
    // Surface the error visually on the badge so it's visible even when the
    // popup is closed. Orange = upload problem (distinct from red = recording).
    chrome.action.setBadgeText({ text: 'ERR' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF8C00' });
  }
}
