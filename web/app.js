const engine = window.VidMixEngine;
const waveform = window.VidMixWaveform;
const capture = window.VidMixCapture;
const musicGenerator = window.VidMixMusicGenerator;
const LivePreviewMixer = window.VidMixLivePreview.LivePreviewMixer;

const FFMPEG_CORE_BASE = 'vendor/ffmpeg-core';

const el = (id) => document.getElementById(id);

const loadButton = el('loadButton');
const mixButton = el('mixButton');
const statusEl = el('status');
const progressEl = el('progress');
const outputNameEl = el('outputName');
const outputFormatSelect = el('outputFormat');
const resolutionSelect = el('resolutionSelect');
const qualitySelect = el('qualitySelect');
const duckFactorEl = el('duckFactor');
const muteVideoAudio = el('muteVideoAudio');
const downloadLinkEl = el('downloadLink');
const downloadButton = el('downloadButton');

const dropArea = el('dropArea');
const videoInput = el('videoInput');
const videoNameEl = el('videoName');
const videoPreview = el('videoPreview');
const previewSupportEl = el('previewSupport');

const timelineTrack = el('timelineTrack');
const trimRegion = el('trimRegion');
const trimStartHandle = el('trimStartHandle');
const trimEndHandle = el('trimEndHandle');
const timelinePlayhead = el('timelinePlayhead');
const trimStartLabel = el('trimStartLabel');
const trimEndLabel = el('trimEndLabel');
const trimDurationLabel = el('trimDurationLabel');

const audioTracksContainer = el('audioTracks');
const audioPlaceholder = el('audioPlaceholder');
const addVoiceTrack = el('addVoiceTrack');
const addBackgroundTrack = el('addBackgroundTrack');

const musicPresetSelect = el('musicPreset');
const musicDurationEl = el('musicDuration');
const musicPreviewButton = el('musicPreviewButton');
const musicAddButton = el('musicAddButton');
const musicStatus = el('musicStatus');

const recordButton = el('recordButton');
const stopRecordButton = el('stopRecordButton');
const recordedStatus = el('recordedStatus');
const previewRecordedButton = el('previewRecordedButton');
const redoRecordingButton = el('redoRecordingButton');
const useRecordedVoice = el('useRecordedVoice');

const captureSupportEl = el('captureSupport');
const captureModeButtons = Array.from(document.querySelectorAll('[data-capture-mode]'));
const flipCameraButton = el('flipCameraButton');
const capturePreview = el('capturePreview');
const captureStartButton = el('captureStartButton');
const captureStopButton = el('captureStopButton');
const captureStatus = el('captureStatus');

const previewPlayButton = el('previewPlayButton');
const previewStopButton = el('previewStopButton');

const aiPromptEl = el('aiPrompt');
const aiOutputEl = el('aiOutput');
const aiRunButton = el('aiRunButton');
const aiQuickButtons = Array.from(document.querySelectorAll('[data-ai-action]'));

let videoFile = null;
let videoDuration = 0;
const trimState = { start: 0, end: null };

let tracks = [];
let trackIdCounter = 0;

let recordedAudioFile = null;
let recordedAudioObjectUrl = null;
let mediaRecorder = null;
let recordedStream = null;

let captureMode = null;
let captureStream = null;
let captureRecorder = null;
let cameraFacingMode = 'user';

let previewMixer = null;
let loaded = false;
let writtenFiles = [];

const browserSupported = checkBrowserSupport();

function checkBrowserSupport() {
  return (
    typeof WebAssembly !== 'undefined' &&
    typeof fetch === 'function' &&
    typeof File === 'function' &&
    typeof FileReader === 'function' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

function getExtension(filename) {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx) : '';
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function mimeForFormat(format) {
  switch (format) {
    case 'webm': return 'video/webm';
    case 'mov': return 'video/quicktime';
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'mp4':
    default: return 'video/mp4';
  }
}

function showToast(msg, timeout = 2500) {
  let t = document.getElementById('vm_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'vm_toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove('show'), timeout);
}

function populateSelect(selectEl, options, selectedValue) {
  selectEl.innerHTML = '';
  options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === selectedValue) option.selected = true;
    selectEl.appendChild(option);
  });
}

populateSelect(outputFormatSelect, engine.FORMATS, 'mp4');
populateSelect(resolutionSelect, engine.RESOLUTIONS, 'original');
populateSelect(musicPresetSelect, musicGenerator.listPresets(), musicGenerator.listPresets()[0].value);

if (!browserSupported) {
  statusEl.textContent = 'This browser does not support the WebAssembly/File APIs VidMix needs.';
  loadButton.disabled = true;
}

captureSupportEl.textContent = `Camera: ${capture.isCameraSupported() ? 'available' : 'unavailable'} · Screen: ${capture.isScreenCaptureSupported() ? 'available' : 'unavailable'}`;

function getAudioCtx() {
  return waveform.getAudioContext();
}

// ---------- ffmpeg.wasm ----------

function createFfmpegInstance() {
  if (typeof FFmpegWASM === 'undefined') return null;
  const instance = new FFmpegWASM.FFmpeg();
  instance.on('progress', ({ progress }) => {
    const pct = Math.min(100, Math.max(0, progress * 100));
    progressEl.value = pct;
    if (loaded) statusEl.textContent = `Mixing ${Math.round(pct)}%`;
  });
  return instance;
}

const ffmpeg = createFfmpegInstance();
if (!ffmpeg && browserSupported) {
  statusEl.textContent = 'Unable to initialize FFmpeg. Try a different browser.';
  loadButton.disabled = true;
}

loadButton.addEventListener('click', async () => {
  if (!ffmpeg || loaded) return;
  statusEl.textContent = 'Loading FFmpeg core (first load only)...';
  try {
    const { toBlobURL } = window.FFmpegUtil;
    const coreURL = await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
    const wasmURL = await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm');
    await ffmpeg.load({ coreURL, wasmURL });
    loaded = true;
    statusEl.textContent = 'FFmpeg loaded. Add media and mix.';
    updateMixButton();
  } catch (err) {
    statusEl.textContent = `FFmpeg failed to load: ${err.message}`;
  }
});

async function cleanupWrittenFiles() {
  for (const name of writtenFiles) {
    try { await ffmpeg.deleteFile(name); } catch (err) { /* not present, ignore */ }
  }
  writtenFiles = [];
}

// ---------- video source + timeline ----------

function setVideoFile(file) {
  videoFile = file;
  videoNameEl.textContent = file.name;
  videoPreview.src = URL.createObjectURL(file);
  videoPreview.load();
  previewSupportEl.textContent = getPreviewSupportMessage(file);
  trimState.start = 0;
  trimState.end = null;
  updateMixButton();
}

function getPreviewSupportMessage(file) {
  const type = file.type || '';
  const canPlay = videoPreview.canPlayType(type);
  if (canPlay === '') {
    const extension = file.name.split('.').pop().toLowerCase();
    return `Preview support: browser may not play .${extension}. Mixing still works.`;
  }
  return 'Preview support: available.';
}

videoPreview.addEventListener('loadedmetadata', () => {
  videoDuration = isFinite(videoPreview.duration) ? videoPreview.duration : 0;
  renderTimeline();
});

videoPreview.addEventListener('timeupdate', () => {
  if (videoDuration) {
    timelinePlayhead.style.left = `${(videoPreview.currentTime / videoDuration) * 100}%`;
  }
});

videoPreview.addEventListener('error', () => {
  if (videoFile) {
    previewSupportEl.textContent = 'Preview support: this format cannot be played in browser. Mixing still works.';
  }
});

videoInput.addEventListener('change', (e) => {
  if (e.target.files[0]) setVideoFile(e.target.files[0]);
});

function renderTimeline() {
  if (!videoDuration) {
    trimRegion.style.left = '0%';
    trimRegion.style.width = '100%';
    trimStartHandle.style.left = '0%';
    trimEndHandle.style.left = '100%';
    trimStartLabel.textContent = '0:00';
    trimEndLabel.textContent = '0:00';
    trimDurationLabel.textContent = 'Full length';
    return;
  }
  const end = trimState.end != null ? trimState.end : videoDuration;
  const startPct = (trimState.start / videoDuration) * 100;
  const endPct = (end / videoDuration) * 100;
  trimRegion.style.left = `${startPct}%`;
  trimRegion.style.width = `${Math.max(0, endPct - startPct)}%`;
  trimStartHandle.style.left = `${startPct}%`;
  trimEndHandle.style.left = `${endPct}%`;
  trimStartLabel.textContent = formatTime(trimState.start);
  trimEndLabel.textContent = formatTime(end);
  trimDurationLabel.textContent = (trimState.start > 0 || end < videoDuration)
    ? `${formatTime(end - trimState.start)} selected`
    : 'Full length';
}

function bindHandleDrag(handleEl, which) {
  handleEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handleEl.setPointerCapture(e.pointerId);
    const onMove = (moveEvt) => {
      if (!videoDuration) return;
      const rect = timelineTrack.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (moveEvt.clientX - rect.left) / rect.width));
      const seconds = ratio * videoDuration;
      if (which === 'start') {
        const maxStart = (trimState.end != null ? trimState.end : videoDuration) - 0.1;
        trimState.start = Math.max(0, Math.min(seconds, maxStart));
      } else {
        const minEnd = trimState.start + 0.1;
        trimState.end = Math.min(videoDuration, Math.max(seconds, minEnd));
      }
      renderTimeline();
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}
bindHandleDrag(trimStartHandle, 'start');
bindHandleDrag(trimEndHandle, 'end');

timelineTrack.addEventListener('pointerdown', (e) => {
  if (e.target !== timelineTrack && e.target !== trimRegion) return;
  if (!videoDuration) return;
  const rect = timelineTrack.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  videoPreview.currentTime = ratio * videoDuration;
});

// ---------- audio lanes ----------

function createTrack(role, file) {
  return {
    id: ++trackIdCounter,
    file: file || null,
    label: role === 'background' ? 'Background' : 'Voice',
    role,
    volume: role === 'background' ? 0.5 : 1.0,
    start: 0,
    duration: null,
    fadeIn: 0,
    fadeOut: 0,
    mute: false,
    solo: false,
    duck: role === 'background',
    objectUrl: null,
    peaks: null
  };
}

function addTrack(role, file) {
  const track = createTrack(role, file || null);
  tracks.push(track);
  renderTracks();
  updateMixButton();
  if (file) attachFileToTrack(track, file);
}

async function attachFileToTrack(track, file) {
  track.file = file;
  track.duration = null;
  track.peaks = null;
  if (track.objectUrl) URL.revokeObjectURL(track.objectUrl);
  track.objectUrl = URL.createObjectURL(file);
  renderTracks();
  updateMixButton();
  try {
    const buffer = await waveform.decodeToAudioBuffer(file, getAudioCtx());
    track.duration = buffer.duration;
    track.peaks = waveform.computePeaks(buffer, 200);
  } catch (err) {
    track.duration = null;
    track.peaks = null;
  }
  renderTracks();
}

function removeTrack(id) {
  const track = tracks.find((t) => t.id === id);
  if (track && track.objectUrl) URL.revokeObjectURL(track.objectUrl);
  tracks = tracks.filter((t) => t.id !== id);
  renderTracks();
  updateMixButton();
}

let draggingTrackId = null;

function createTrackRow(track) {
  const row = document.createElement('div');
  row.className = 'track-row';
  row.draggable = true;
  row.dataset.id = String(track.id);

  row.addEventListener('dragstart', () => { draggingTrackId = track.id; row.classList.add('dragging'); });
  row.addEventListener('dragend', () => { draggingTrackId = null; row.classList.remove('dragging'); });
  row.addEventListener('dragover', (e) => e.preventDefault());
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    if (draggingTrackId === null || draggingTrackId === track.id) return;
    const fromIdx = tracks.findIndex((t) => t.id === draggingTrackId);
    const toIdx = tracks.findIndex((t) => t.id === track.id);
    const [moved] = tracks.splice(fromIdx, 1);
    tracks.splice(toIdx, 0, moved);
    renderTracks();
  });

  const dragHandle = document.createElement('div');
  dragHandle.className = 'track-drag-handle';
  dragHandle.textContent = '⋮⋮';
  row.appendChild(dragHandle);

  const main = document.createElement('div');
  main.className = 'track-main';
  row.appendChild(main);

  const top = document.createElement('div');
  top.className = 'track-top';
  main.appendChild(top);

  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.className = 'track-label';
  labelInput.value = track.label;
  labelInput.addEventListener('input', () => { track.label = labelInput.value; });
  top.appendChild(labelInput);

  const roleSelect = document.createElement('select');
  roleSelect.innerHTML = '<option value="voice">Voice</option><option value="background">Background</option>';
  roleSelect.value = track.role;
  roleSelect.addEventListener('change', () => {
    track.role = roleSelect.value;
    duckLabel.style.display = track.role === 'background' ? '' : 'none';
  });
  top.appendChild(roleSelect);

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'chip' + (track.mute ? ' active' : '');
  muteBtn.textContent = 'Mute';
  muteBtn.addEventListener('click', () => { track.mute = !track.mute; renderTracks(); });
  top.appendChild(muteBtn);

  const soloBtn = document.createElement('button');
  soloBtn.type = 'button';
  soloBtn.className = 'chip' + (track.solo ? ' active' : '');
  soloBtn.textContent = 'Solo';
  soloBtn.addEventListener('click', () => { track.solo = !track.solo; renderTracks(); });
  top.appendChild(soloBtn);

  const duckLabel = document.createElement('label');
  duckLabel.className = 'checkbox-label chip-label';
  duckLabel.style.display = track.role === 'background' ? '' : 'none';
  const duckCheckbox = document.createElement('input');
  duckCheckbox.type = 'checkbox';
  duckCheckbox.checked = track.duck;
  duckCheckbox.addEventListener('change', () => { track.duck = duckCheckbox.checked; });
  duckLabel.appendChild(duckCheckbox);
  duckLabel.appendChild(document.createTextNode(' Duck'));
  top.appendChild(duckLabel);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-track';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => removeTrack(track.id));
  top.appendChild(removeBtn);

  const fileRow = document.createElement('div');
  fileRow.className = 'track-file-row';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'audio/*,.aac,.m4a,.mp3,.wav,.flac,.ogg,.opus,.aif,.aiff,.alac';
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) attachFileToTrack(track, e.target.files[0]);
  });
  const fileNameSpan = document.createElement('span');
  fileNameSpan.className = 'path';
  fileNameSpan.textContent = track.file ? track.file.name : 'No file selected';
  fileRow.appendChild(fileInput);
  fileRow.appendChild(fileNameSpan);
  main.appendChild(fileRow);

  const canvas = document.createElement('canvas');
  canvas.className = 'track-waveform';
  main.appendChild(canvas);
  if (track.peaks) {
    requestAnimationFrame(() => waveform.drawWaveform(canvas, track.peaks, { muted: track.mute }));
  }

  const params = document.createElement('div');
  params.className = 'track-params';

  function paramField(labelText, input) {
    const wrap = document.createElement('label');
    wrap.className = 'param-field';
    wrap.appendChild(document.createTextNode(labelText));
    wrap.appendChild(input);
    return wrap;
  }

  const volumeInput = document.createElement('input');
  volumeInput.type = 'number';
  volumeInput.min = '0';
  volumeInput.step = '0.1';
  volumeInput.value = track.volume;
  volumeInput.className = 'small-input';
  volumeInput.addEventListener('input', () => { track.volume = parseFloat(volumeInput.value) || 0; });
  params.appendChild(paramField('Vol', volumeInput));

  const startInput = document.createElement('input');
  startInput.type = 'number';
  startInput.min = '0';
  startInput.step = '0.1';
  startInput.value = track.start;
  startInput.className = 'small-input';
  startInput.addEventListener('input', () => { track.start = parseFloat(startInput.value) || 0; });
  params.appendChild(paramField('Start', startInput));

  const fadeInInput = document.createElement('input');
  fadeInInput.type = 'number';
  fadeInInput.min = '0';
  fadeInInput.step = '0.1';
  fadeInInput.value = track.fadeIn;
  fadeInInput.className = 'small-input';
  fadeInInput.addEventListener('input', () => { track.fadeIn = parseFloat(fadeInInput.value) || 0; });
  params.appendChild(paramField('Fade in', fadeInInput));

  const fadeOutInput = document.createElement('input');
  fadeOutInput.type = 'number';
  fadeOutInput.min = '0';
  fadeOutInput.step = '0.1';
  fadeOutInput.value = track.fadeOut;
  fadeOutInput.className = 'small-input';
  fadeOutInput.addEventListener('input', () => { track.fadeOut = parseFloat(fadeOutInput.value) || 0; });
  params.appendChild(paramField('Fade out', fadeOutInput));

  main.appendChild(params);

  return row;
}

function renderTracks() {
  audioTracksContainer.innerHTML = '';
  tracks.forEach((track) => audioTracksContainer.appendChild(createTrackRow(track)));
  audioPlaceholder.style.display = tracks.some((t) => t.file) ? 'none' : 'block';
}

addVoiceTrack.addEventListener('click', () => addTrack('voice'));
addBackgroundTrack.addEventListener('click', () => addTrack('background'));

// ---------- music library ----------

musicPreviewButton.addEventListener('click', async () => {
  musicStatus.textContent = 'Generating preview...';
  try {
    const duration = Math.max(5, parseFloat(musicDurationEl.value) || 30);
    const blob = await musicGenerator.renderPreset(musicPresetSelect.value, duration);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
    musicStatus.textContent = 'Playing preview...';
  } catch (err) {
    musicStatus.textContent = `Preview failed: ${err.message}`;
  }
});

musicAddButton.addEventListener('click', async () => {
  musicStatus.textContent = 'Generating background lane...';
  try {
    const duration = Math.max(5, parseFloat(musicDurationEl.value) || 30);
    const presetLabel = musicPresetSelect.options[musicPresetSelect.selectedIndex].textContent;
    const blob = await musicGenerator.renderPreset(musicPresetSelect.value, duration);
    const file = new File([blob], `${musicPresetSelect.value}-bed.wav`, { type: 'audio/wav' });
    addTrack('background', file);
    musicStatus.textContent = `Added "${presetLabel}" as a background lane.`;
  } catch (err) {
    musicStatus.textContent = `Could not generate music: ${err.message}`;
  }
});

// ---------- voice recording ----------

recordButton.addEventListener('click', async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = 'Microphone recording is not supported in this browser.';
    return;
  }
  try {
    recordedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(recordedStream);
    const chunks = [];
    mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      recordedAudioFile = new File([blob], 'voice-recording.webm', { type: 'audio/webm' });
      if (recordedAudioObjectUrl) URL.revokeObjectURL(recordedAudioObjectUrl);
      recordedAudioObjectUrl = URL.createObjectURL(recordedAudioFile);
      recordedStatus.textContent = `Recorded voice ready (${Math.round(blob.size / 1024)} KB)`;
      useRecordedVoice.disabled = false;
      useRecordedVoice.checked = true;
      recordButton.disabled = false;
      stopRecordButton.disabled = true;
      redoRecordingButton.disabled = false;
      previewRecordedButton.disabled = false;
      if (recordedStream) { recordedStream.getTracks().forEach((t) => t.stop()); recordedStream = null; }
      if (videoPreview) { videoPreview.pause(); videoPreview.currentTime = 0; }
      updateMixButton();
    };
    mediaRecorder.start();
    if (videoPreview && videoFile) {
      videoPreview.muted = true;
      videoPreview.currentTime = 0;
      videoPreview.play().catch(() => {});
    }
    recordButton.disabled = true;
    stopRecordButton.disabled = false;
    recordedStatus.textContent = 'Recording...';
  } catch (err) {
    statusEl.textContent = `Microphone error: ${err.message}`;
  }
});

stopRecordButton.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
});

redoRecordingButton.addEventListener('click', () => {
  recordedAudioFile = null;
  if (recordedAudioObjectUrl) { URL.revokeObjectURL(recordedAudioObjectUrl); recordedAudioObjectUrl = null; }
  useRecordedVoice.checked = false;
  useRecordedVoice.disabled = true;
  previewRecordedButton.disabled = true;
  redoRecordingButton.disabled = true;
  recordedStatus.textContent = 'No voice recorded';
  updateMixButton();
});

previewRecordedButton.addEventListener('click', () => {
  if (!recordedAudioObjectUrl) return;
  new Audio(recordedAudioObjectUrl).play();
});

useRecordedVoice.addEventListener('change', updateMixButton);
muteVideoAudio.addEventListener('change', updateMixButton);

// ---------- capture (point and shoot) ----------

async function stopCapturePreview() {
  if (captureStream) { capture.stopStream(captureStream); captureStream = null; }
  capturePreview.srcObject = null;
  capturePreview.classList.add('hidden');
}

async function activateCaptureMode(mode) {
  await stopCapturePreview();
  captureMode = mode;
  captureModeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.captureMode === mode));
  captureStartButton.disabled = true;
  flipCameraButton.classList.toggle('hidden', mode !== 'camera');

  try {
    if (mode === 'camera') {
      captureStream = await capture.openCameraStream({ facingMode: cameraFacingMode, withAudio: true });
      capturePreview.srcObject = captureStream;
      capturePreview.classList.remove('hidden');
      captureStatus.textContent = 'Camera ready. Press Start Recording.';
    } else if (mode === 'screen') {
      captureStream = await capture.openScreenStream({ withAudio: true });
      capturePreview.srcObject = captureStream;
      capturePreview.classList.remove('hidden');
      captureStatus.textContent = 'Screen share ready. Press Start Recording.';
    } else if (mode === 'mic') {
      captureStream = await capture.openMicStream();
      captureStatus.textContent = 'Microphone ready. Press Start Recording.';
    }
    captureStartButton.disabled = false;
  } catch (err) {
    captureStatus.textContent = `Could not start ${mode}: ${err.message}`;
    captureMode = null;
  }
}

captureModeButtons.forEach((btn) => {
  btn.addEventListener('click', () => activateCaptureMode(btn.dataset.captureMode));
});

flipCameraButton.addEventListener('click', async () => {
  cameraFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
  if (captureMode === 'camera') await activateCaptureMode('camera');
});

captureStartButton.addEventListener('click', () => {
  if (!captureStream) return;
  captureRecorder = new capture.Recorder(captureStream, { kind: captureMode === 'mic' ? 'audio' : 'video' });
  captureRecorder.start();
  captureStartButton.disabled = true;
  captureStopButton.disabled = false;
  captureModeButtons.forEach((btn) => { btn.disabled = true; });
  captureStatus.textContent = 'Recording...';
});

captureStopButton.addEventListener('click', async () => {
  if (!captureRecorder) return;
  captureStatus.textContent = 'Finishing recording...';
  const file = await captureRecorder.stop();
  captureStopButton.disabled = true;
  captureModeButtons.forEach((btn) => { btn.disabled = false; });

  if (captureMode === 'mic') {
    addTrack('voice', file);
    captureStatus.textContent = 'Recording added as a voice lane.';
  } else {
    setVideoFile(file);
    captureStatus.textContent = 'Recording set as the source video.';
  }

  await stopCapturePreview();
  captureMode = null;
  captureModeButtons.forEach((btn) => btn.classList.remove('active'));
  flipCameraButton.classList.add('hidden');
  captureStartButton.disabled = true;
});

// ---------- live preview ----------

function ensurePreviewMixer() {
  if (!previewMixer) previewMixer = new LivePreviewMixer(videoPreview, getAudioCtx());
  return previewMixer;
}

function syncPreviewLanes() {
  const mixer = ensurePreviewMixer();
  mixer.setVideoMuted(muteVideoAudio.checked);
  const activeIds = new Set();
  const duckFactor = (parseInt(duckFactorEl.value, 10) || 35) / 100;

  tracks.forEach((track) => {
    if (!track.file) return;
    const id = `t${track.id}`;
    activeIds.add(id);
    mixer.setLane({
      id, url: track.objectUrl, role: track.role, volume: track.volume, start: track.start,
      duration: track.duration, fadeIn: track.fadeIn, fadeOut: track.fadeOut,
      mute: track.mute, solo: track.solo, duck: track.duck, duckFactor
    });
  });

  if (recordedAudioFile && useRecordedVoice.checked && recordedAudioObjectUrl) {
    activeIds.add('recorded-voice');
    mixer.setLane({ id: 'recorded-voice', url: recordedAudioObjectUrl, role: 'voice', volume: 1, start: 0, duration: null, fadeIn: 0, fadeOut: 0, mute: false, solo: false, duck: false });
  }

  Array.from(mixer.lanes.keys()).forEach((id) => { if (!activeIds.has(id)) mixer.removeLane(id); });
}

previewPlayButton.addEventListener('click', () => {
  if (!videoFile) { statusEl.textContent = 'Add a video first.'; return; }
  syncPreviewLanes();
  ensurePreviewMixer().start();
  videoPreview.play().catch(() => {});
});

previewStopButton.addEventListener('click', () => {
  if (previewMixer) previewMixer.stop();
  videoPreview.pause();
});

// ---------- drag and drop ----------

function handleDrop(files) {
  const audioExtensions = ['.aac', '.m4a', '.mp3', '.wav', '.flac', '.ogg', '.opus', '.webm', '.aif', '.aiff', '.alac'];
  const videoExtensions = ['.mov', '.mkv', '.avi', '.webm', '.mp4', '.ogv', '.flv'];

  Array.from(files).forEach((file) => {
    if (!file) return;
    const extension = getExtension(file.name).toLowerCase();
    if (file.type.startsWith('video/') || videoExtensions.includes(extension)) {
      setVideoFile(file);
    } else if (file.type.startsWith('audio/') || audioExtensions.includes(extension)) {
      addTrack('voice', file);
    }
  });
}

['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
  dropArea.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
});
dropArea.addEventListener('dragover', () => dropArea.classList.add('dragover'), false);
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'), false);
dropArea.addEventListener('drop', (event) => {
  dropArea.classList.remove('dragover');
  handleDrop(event.dataTransfer.files);
}, false);

// ---------- mix assistant (local heuristics, no network calls) ----------

function getAIContext() {
  const activeTracks = tracks.filter((t) => t.file);
  return {
    trackCount: activeTracks.length,
    hasVoice: activeTracks.some((t) => t.role === 'voice') || !!(recordedAudioFile && useRecordedVoice.checked),
    hasBackground: activeTracks.some((t) => t.role === 'background'),
    videoName: videoFile ? videoFile.name : 'your video'
  };
}

function applyAIPreset() {
  const ctx = getAIContext();
  if (ctx.trackCount === 0 && !ctx.hasVoice) {
    aiOutputEl.innerHTML = '<strong>Mix assistant</strong><p>Add at least one audio lane or a voice recording so I can tailor the mix.</p>';
    return;
  }
  tracks.forEach((track) => {
    if (!track.file) return;
    track.volume = track.role === 'voice' ? 0.9 : 0.35;
    track.duck = track.role === 'background';
  });
  renderTracks();
  if (ctx.hasVoice) useRecordedVoice.checked = true;
  outputNameEl.value = `${(videoFile ? videoFile.name.replace(/\.[^.]+$/, '') : 'mix').replace(/\s+/g, '-')}-studio-mix`;
  showToast('Mix suggestions applied');
}

function runAI(action = 'suggest', prompt = '') {
  const ctx = getAIContext();
  let title = 'Mix assistant';
  let body = '';

  if (action === 'caption') {
    title = 'Suggested caption';
    body = `A clean mix of ${ctx.videoName} with ${ctx.trackCount} audio lane${ctx.trackCount === 1 ? '' : 's'}${ctx.hasVoice ? ' and a voiceover' : ''}.`;
  } else if (action === 'name') {
    title = 'Suggested export name';
    const base = (videoFile ? videoFile.name.replace(/\.[^.]+$/, '') : 'mix').replace(/\s+/g, '-').toLowerCase();
    body = `Recommended output name: ${base}-studio-${ctx.hasVoice ? 'voice' : 'audio'}`;
    outputNameEl.value = body.split(': ')[1] || 'mixed-output';
    showToast('Export name updated');
  } else {
    if (ctx.trackCount === 0 && !ctx.hasVoice) {
      body = 'Add a voice recording or at least one audio lane for targeted guidance.';
    } else {
      body = `Set voice lanes near 0.9 volume, background lanes near 0.3-0.4 with Duck enabled, and ${ctx.hasVoice ? 'keep the voice lane active' : 'add a voice layer if clarity matters'}.`;
      applyAIPreset();
    }
  }

  if (prompt && prompt.trim()) body += `\n\nCustom request: ${prompt.trim()}`;
  aiOutputEl.innerHTML = `<strong>${title}</strong><p>${body}</p>`;
}

if (aiRunButton) aiRunButton.addEventListener('click', () => runAI('suggest', aiPromptEl ? aiPromptEl.value : ''));
aiQuickButtons.forEach((button) => {
  button.addEventListener('click', () => runAI(button.dataset.aiAction, aiPromptEl ? aiPromptEl.value : ''));
});

// ---------- export ----------

function updateMixButton() {
  mixButton.disabled = !browserSupported || !videoFile || !loaded;
}

mixButton.addEventListener('click', async () => {
  if (!videoFile || !ffmpeg || !loaded) return;

  const baseName = outputNameEl.value.trim() || 'mixed-output';
  const format = outputFormatSelect.value;
  const outputName = engine.defaultOutputName(baseName, format);
  const trimDuration = (trimState.end != null && videoDuration)
    ? Math.max(0.1, trimState.end - trimState.start)
    : null;

  mixButton.disabled = true;
  statusEl.textContent = 'Preparing files...';
  progressEl.value = 0;

  try {
    await cleanupWrittenFiles();

    const videoName = 'input_video' + getExtension(videoFile.name);
    const { fetchFile } = window.FFmpegUtil;
    await ffmpeg.writeFile(videoName, await fetchFile(videoFile));
    writtenFiles.push(videoName);

    const trackSpecs = [];
    for (const track of tracks) {
      if (!track.file) continue;
      const vname = `track_${trackSpecs.length}${getExtension(track.file.name)}`;
      await ffmpeg.writeFile(vname, await fetchFile(track.file));
      writtenFiles.push(vname);
      trackSpecs.push(Object.assign({}, track, { name: vname }));
    }

    if (recordedAudioFile && useRecordedVoice.checked) {
      const vname = `track_${trackSpecs.length}${getExtension(recordedAudioFile.name)}`;
      await ffmpeg.writeFile(vname, await fetchFile(recordedAudioFile));
      writtenFiles.push(vname);
      trackSpecs.push({ name: vname, role: 'voice', label: 'Recorded voice', volume: 1.0, start: 0, duration: null, fadeIn: 0, fadeOut: 0, mute: false, solo: false, duck: false });
    }

    const args = engine.buildMixArgs({
      videoInput: videoName,
      videoTrim: { start: trimState.start, duration: trimDuration },
      muteVideoAudio: muteVideoAudio.checked,
      tracks: trackSpecs,
      outputName,
      format,
      resolution: resolutionSelect.value,
      quality: qualitySelect.value,
      duckFactor: (parseInt(duckFactorEl.value, 10) || 35) / 100
    });

    statusEl.textContent = 'Mixing...';
    await ffmpeg.exec(args);

    const data = await ffmpeg.readFile(outputName);
    writtenFiles.push(outputName);
    const blob = new Blob([data.buffer], { type: mimeForFormat(format) });
    const url = URL.createObjectURL(blob);
    downloadButton.href = url;
    downloadButton.download = outputName;
    downloadButton.textContent = `Download ${outputName}`;
    downloadButton.classList.remove('hidden');
    statusEl.textContent = 'Mix ready';
    progressEl.value = 100;
  } catch (err) {
    statusEl.textContent = `Mix failed: ${err.message}`;
  } finally {
    updateMixButton();
  }
});

downloadButton.addEventListener('click', async (e) => {
  try {
    e.preventDefault();
    const href = downloadButton.href;
    const filename = downloadButton.download || 'mixed-output.mp4';
    if (!href) return;
    if (href.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = href; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      showToast('Download started');
      return;
    }
    const resp = await fetch(href);
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showToast('Download started');
  } catch (err) {
    statusEl.textContent = `Download error: ${err.message}`;
  }
});

renderTracks();
renderTimeline();
updateMixButton();
statusEl.textContent = 'Add a video to begin mixing.';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(() => {
    // Unsupported here (e.g. file:// in Electron) - the app still works fully online.
  });
}
