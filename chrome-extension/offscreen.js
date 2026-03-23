let recorder = null;
let audioCtx = null;
let chunkIndex = 0; // Tracks position in the WebM stream (0 = header chunk)

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'start-offscreen') start(msg.streamId);
  if (msg.type === 'stop-offscreen') stop();
});

async function start(streamId) {
  chunkIndex = 0;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId }
    }
  });

  // Pass audio through to speakers so the user can still hear the tab
  audioCtx = new AudioContext();
  audioCtx.createMediaStreamSource(stream).connect(audioCtx.destination);

  recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

  recorder.ondataavailable = async (e) => {
    if (e.data.size === 0) return;

    const buffer = await e.data.arrayBuffer();

    // FIX (stack overflow): The original used:
    //   btoa(String.fromCharCode(...new Uint8Array(buffer)))
    // Spreading a large TypedArray into a variadic call exceeds the JS engine's
    // argument stack limit (~500KB depending on browser) and throws RangeError.
    // A manual loop is identical in output but safe for arbitrarily large buffers.
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    // Send chunk index alongside data so background.js knows which chunk is
    // the WebM header (index 0) and can preserve it across upload batches.
    chrome.runtime.sendMessage({ type: 'audio-chunk', data: base64, index: chunkIndex++ });
  };

  // FIX (race condition): onstop fires AFTER the final ondataavailable call,
  // guaranteeing all chunks have been forwarded before we signal background.js
  // to begin the upload. Previously stopRecording() uploaded immediately after
  // sending 'stop-offscreen', missing the last chunk(s) entirely.
  recorder.onstop = () => {
    chrome.runtime.sendMessage({ type: 'offscreen-stopped' });
  };

  // Keep-alive: Send periodic pings to background to keep service worker awake
  // The offscreen document stays alive while recording, so setInterval works here
  const keepAliveInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'keep-alive' });
  }, 20000); // every 20 seconds
  
  // Store interval ID for cleanup on stop
  window.keepAliveInterval = keepAliveInterval;

  recorder.start(5000); // Emit one chunk every 5 seconds
}

function stop() {
  // recorder.stop() is asynchronous — it triggers ondataavailable (final chunk)
  // then onstop. The 'offscreen-stopped' message is sent from onstop, not here.
  recorder?.stop();
  recorder?.stream.getTracks().forEach(t => t.stop());

  // FIX (AudioContext not closed): Release the audio pipeline when done.
  // Failing to call close() keeps speaker/mic handles open unnecessarily.
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }

  // Cancel the keep-alive interval now that we're done recording
  if (window.keepAliveInterval) {
    clearInterval(window.keepAliveInterval);
    window.keepAliveInterval = null;
  }

  // Extra buffer so onstop fires and sends 'offscreen-stopped' before the
  // document closes. 1500ms > the time recorder needs to flush its final chunk.
  setTimeout(() => window.close(), 1500);
}
