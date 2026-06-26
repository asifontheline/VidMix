const ffmpegLibrary = typeof FFmpeg !== 'undefined' ? FFmpeg : null;
const createFFmpeg = ffmpegLibrary ? ffmpegLibrary.createFFmpeg : (typeof window !== 'undefined' && typeof window.createFFmpeg !== 'undefined' ? window.createFFmpeg : null);
const fetchFile = ffmpegLibrary ? ffmpegLibrary.fetchFile : (typeof window !== 'undefined' && typeof window.fetchFile !== 'undefined' ? window.fetchFile : null);
const ffmpeg = createFFmpeg ? createFFmpeg({ log: true }) : null;
const videoInput = document.getElementById('videoInput');
const audioTracksContainer = document.getElementById('audioTracks');
const addAudioTrack = document.getElementById('addAudioTrack');
const loadButton = document.getElementById('loadButton');
const mixButton = document.getElementById('mixButton');
const modeSelect = document.getElementById('modeSelect');
const serverStatus = document.getElementById('serverStatus');
const browserSupportEl = document.getElementById('browserSupport');
const previewSupportEl = document.getElementById('previewSupport');
const statusEl = document.getElementById('status');
const progressEl = document.getElementById('progress');
const videoNameEl = document.getElementById('videoName');
const outputNameEl = document.getElementById('outputName');
const downloadLinkEl = document.getElementById('downloadLink');
const downloadButton = document.getElementById('downloadButton');
const videoPreview = document.getElementById('videoPreview');
const dropArea = document.getElementById('dropArea');
const recordButton = document.getElementById('recordButton');
const stopRecordButton = document.getElementById('stopRecordButton');
const recordedStatus = document.getElementById('recordedStatus');
const previewRecordedButton = document.getElementById('previewRecordedButton');
const redoRecordingButton = document.getElementById('redoRecordingButton');
const useRecordedVoice = document.getElementById('useRecordedVoice');
const muteVideoAudio = document.getElementById('muteVideoAudio');
const outputFormatSelect = document.getElementById('outputFormat');

let videoFile = null;
let audioTracks = [];
let loaded = false;
let serverMode = false;
let mediaRecorder = null;
let recordedStream = null;
let recordedAudioFile = null;

const browserSupported = checkBrowserSupport();

if (!browserSupported) {
  serverMode = true;
  modeSelect.value = 'server';
  serverStatus.textContent = 'Local browser mode is unsupported. Server mode is required.';
  loadButton.disabled = true;
}

browserSupportEl.textContent = getBrowserMessage();
previewSupportEl.textContent = getPreviewSupportMessage();

if (!ffmpeg && browserSupported) {
  statusEl.textContent = 'Browser mixing requires loading FFmpeg. Click Load FFmpeg to initialize it.';
}
function getBrowserMessage() {
  const browser = getBrowserName();
  if (!browserSupported) {
    return 'Browser mode is not supported by this browser. Use Server mode.';
  }
  return `Detected: ${browser}. Best experience is in Chrome, Firefox, or Edge. Safari support is improving.`;
}
function getBrowserName() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  if (/OPR\//.test(ua)) return 'Opera';
  return 'Unknown browser';
}

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

function getPreviewSupportMessage(file = null) {
  const hasMediaDevices = typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
  if (!hasMediaDevices) {
    return 'Preview support: not available in this browser. Microphone capture is unsupported.';
  }
  if (!browserSupported) {
    return 'Preview support: unavailable because browser mixing is unsupported. Use server mode.';
  }
  if (file) {
    const type = file.type || '';
    const canPlay = videoPreview.canPlayType(type);
    if (canPlay === '') {
      const extension = file.name.split('.').pop().toLowerCase();
      if (['mov', 'mkv', 'avi', 'mp4', 'webm', 'ogv'].includes(extension)) {
        return `Preview support: browser may not play .${extension}. You can still record voice and mix the video.`;
      }
      return 'Preview support: unknown for this format. Recording and mixing still work.';
    }
  }
  return 'Preview support: available. You can record voice while watching the video preview.';
}

function getExtension(filename) {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx) : '';
}

function updateMixButton() {
  const hasVideo = !!videoFile;
  const hasAudio = audioTracks.some((track) => track && track.file) || (recordedAudioFile && useRecordedVoice.checked);
  if (serverMode || !ffmpeg || !loaded) {
    mixButton.disabled = !hasVideo;
  } else {
    mixButton.disabled = !browserSupported || !hasVideo;
  }
}

function createAudioRow(index) {
  const row = document.createElement('div');
  row.className = 'audio-row';
  row.dataset.index = index;

  const label = document.createElement('label');
  label.textContent = `Track ${index + 1}`;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'audio/*,.aac,.m4a,.mp3,.wav,.flac,.ogg,.opus,.aif,.aiff,.alac';

  const volumeLabel = document.createElement('span');
  volumeLabel.className = 'small-label';
  volumeLabel.textContent = 'Vol';
  const volumeInput = document.createElement('input');
  volumeInput.type = 'number';
  volumeInput.min = '0';
  volumeInput.step = '0.1';
  volumeInput.value = String(audioTracks[index].volume || 1.0);
  volumeInput.title = 'Track volume multiplier';
  volumeInput.className = 'small-input';

  const startLabel = document.createElement('span');
  startLabel.className = 'small-label';
  startLabel.textContent = 'Start';
  const startInput = document.createElement('input');
  startInput.type = 'number';
  startInput.min = '0';
  startInput.step = '0.1';
  startInput.value = String(audioTracks[index].start || 0);
  startInput.placeholder = 'sec';
  startInput.title = 'Track start offset in seconds';
  startInput.className = 'small-input';

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.textContent = 'Remove';
  removeButton.className = 'remove-track';

  row.appendChild(label);
  row.appendChild(fileInput);
  row.appendChild(volumeLabel);
  row.appendChild(volumeInput);
  row.appendChild(startLabel);
  row.appendChild(startInput);
  row.appendChild(removeButton);
  audioTracksContainer.appendChild(row);

  fileInput.addEventListener('change', (event) => {
    audioTracks[index].file = event.target.files[0];
    updateMixButton();
  });

  volumeInput.addEventListener('input', (event) => {
    audioTracks[index].volume = parseFloat(event.target.value) || 1.0;
  });

  startInput.addEventListener('input', (event) => {
    audioTracks[index].start = parseFloat(event.target.value) || 0;
  });

  removeButton.addEventListener('click', () => {
    audioTracks[index] = null;
    rebuildAudioRows();
    updateMixButton();
  });
}

function rebuildAudioRows() {
  const activeTracks = audioTracks.filter((track) => track && track.file);
  audioTracks = activeTracks.map((track) => ({
    file: track.file,
    volume: typeof track.volume === 'number' ? track.volume : 1.0,
    start: typeof track.start === 'number' ? track.start : 0,
  }));
  audioTracksContainer.innerHTML = '';
  audioTracks.forEach((_, index) => createAudioRow(index));
  updateAudioPlaceholder();
}

function addTrack(file = null) {
  audioTracks.push({ file, volume: 1.0, start: 0 });
  createAudioRow(audioTracks.length - 1);
  updateMixButton();
  updateAudioPlaceholder();
}

function updateAudioPlaceholder() {
  const ph = document.getElementById('audioPlaceholder');
  if (!ph) return;
  const hasTracks = audioTracks.some((t) => t && t.file);
  ph.style.display = hasTracks ? 'none' : 'block';
}

function handleDrop(files) {
  const audioExtensions = ['.aac', '.m4a', '.mp3', '.wav', '.flac', '.ogg', '.opus', '.webm', '.aif', '.aiff', '.alac'];
  const videoExtensions = ['.mov', '.mkv', '.avi', '.webm', '.mp4', '.ogv', '.flv'];

  Array.from(files).forEach((file) => {
    if (!file) return;
    const extension = getExtension(file.name).toLowerCase();
    if (file.type.startsWith('video/') || videoExtensions.includes(extension)) {
      videoFile = file;
      videoNameEl.textContent = file.name;
      videoPreview.src = URL.createObjectURL(file);
      videoPreview.load();
      previewSupportEl.textContent = getPreviewSupportMessage(file);
    } else if (file.type.startsWith('audio/') || audioExtensions.includes(extension)) {
      addTrack(file);
    }
  });
  updateMixButton();
}

videoInput.addEventListener('change', (e) => {
  videoFile = e.target.files[0];
  videoNameEl.textContent = videoFile ? videoFile.name : 'No video selected';
  if (videoFile) {
    videoPreview.src = URL.createObjectURL(videoFile);
    videoPreview.load();
    previewSupportEl.textContent = getPreviewSupportMessage(videoFile);
  } else {
    videoPreview.removeAttribute('src');
  }
  updateMixButton();
});

addAudioTrack.addEventListener('click', () => addTrack());

recordButton.addEventListener('click', startRecording);
stopRecordButton.addEventListener('click', stopRecording);
previewRecordedButton.addEventListener('click', previewRecordedVoice);
redoRecordingButton.addEventListener('click', redoRecording);
useRecordedVoice.addEventListener('change', updateMixButton);

loadButton.addEventListener('click', async () => {
  if (!browserSupported) {
    statusEl.textContent = 'Browser mode is not supported in this browser. Use Server mode instead.';
    return;
  }
  if (!ffmpeg) {
    statusEl.textContent = 'Unable to initialize FFmpeg in this browser environment. Use Server mode or try a different browser.';
    return;
  }

  if (!ffmpeg.isLoaded()) {
    statusEl.textContent = 'Loading FFmpeg...';
    try {
      await ffmpeg.load();
      loaded = true;
      statusEl.textContent = 'FFmpeg loaded. Select files and mix.';
      updateMixButton();
    } catch (error) {
      statusEl.textContent = `FFmpeg failed to load: ${error.message}`;
    }
  }
});

modeSelect.addEventListener('change', () => {
  serverMode = modeSelect.value === 'server';
  if (!browserSupported && modeSelect.value === 'browser') {
    serverStatus.textContent = 'This browser does not support local WebAssembly mixing. Switch to Server mode.';
  } else {
    serverStatus.textContent = serverMode ? 'Server mode requires `server.py` running' : 'Browser mode runs locally in the browser';
  }
  updateMixButton();
});

mixButton.addEventListener('click', async () => {
  const baseName = outputNameEl.value.trim() || 'mixed-output';
  const format = outputFormatSelect.value;
  const outputName = baseName.endsWith(`.${format}`) ? baseName : `${baseName}.${format}`;
  const videoStartRaw = document.getElementById('videoStart').value;
  const videoDurationRaw = document.getElementById('videoDuration').value;
  const videoStart = parseFloat(videoStartRaw) || 0;
  const videoDuration = Number.isFinite(parseFloat(videoDurationRaw)) ? parseFloat(videoDurationRaw) : NaN;

  if (!videoFile) return;

  // If local FFmpeg is unavailable, auto-fallback to server mode
  if (serverMode || !ffmpeg || !loaded) {
    // ensure serverMode is true for consistent behavior
    serverMode = true;
    modeSelect.value = 'server';
    serverStatus.textContent = 'Server mode: uploading to server for mixing';
    await mixOnServer(outputName, videoStart, videoDuration);
    return;
  }

  statusEl.textContent = 'Uploading files to FFmpeg...';
  const videoFileName = 'video' + getExtension(videoFile.name);
  ffmpeg.FS('writeFile', videoFileName, await fetchFile(videoFile));

  const audioNames = [];
  const audioInfos = [];
  for (let i = 0; i < audioTracks.length; i++) {
    const track = audioTracks[i];
    if (track && track.file) {
      const name = `audio${audioNames.length}` + getExtension(track.file.name);
      audioNames.push(name);
      audioInfos.push({ volume: track.volume ?? 1.0, start: track.start ?? 0 });
      ffmpeg.FS('writeFile', name, await fetchFile(track.file));
    }
  }

  if (recordedAudioFile && useRecordedVoice.checked) {
    const name = 'recorded_voice' + getExtension(recordedAudioFile.name);
    audioNames.push(name);
    audioInfos.push({ volume: 1.0, start: 0 });
    ffmpeg.FS('writeFile', name, await fetchFile(recordedAudioFile));
  }

  const ffmpegArgs = [];
  if (!isNaN(videoDuration) && videoDuration > 0) {
    ffmpegArgs.push('-ss', `${videoStart}`);
  }
  ffmpegArgs.push('-i', videoFileName);
  audioNames.forEach((name) => ffmpegArgs.push('-i', name));

  const audioSourceLabels = [];
  const filterComplexParts = [];
  if (!muteVideoAudio.checked && audioNames.length === 0) {
    audioSourceLabels.push('0:a:0');
  }
  if (!muteVideoAudio.checked && audioNames.length > 0) {
    audioSourceLabels.push('0:a:0');
  }

  for (let i = 0; i < audioNames.length; i++) {
    const source = `${i + 1}:a`;
    const info = audioInfos[i];
    const filters = [];
    if (info.volume !== 1.0) {
      filters.push(`volume=${info.volume}`);
    }
    if (!isNaN(info.start) && info.start > 0) {
      const delayMs = Math.round(info.start * 1000);
      filters.push(`adelay=${delayMs}|${delayMs}`);
    }
    if (filters.length > 0) {
      filterComplexParts.push(`[${source}]${filters.join(',')}[a${i}]`);
      audioSourceLabels.push(`a${i}`);
    } else {
      audioSourceLabels.push(source);
    }
  }

  ffmpegArgs.push('-map', '0:v:0');
  if (audioSourceLabels.length === 0) {
    ffmpegArgs.push('-an');
  } else if (filterComplexParts.length > 0 || audioSourceLabels.length > 1) {
    const mixLabels = audioSourceLabels.map((label) => `[${label}]`).join('');
    filterComplexParts.push(`${mixLabels}amix=inputs=${audioSourceLabels.length}:duration=shortest[aout]`);
    ffmpegArgs.push('-filter_complex', filterComplexParts.join(';'));
    ffmpegArgs.push('-map', '[aout]');
  } else {
    ffmpegArgs.push('-map', audioSourceLabels[0]);
  }

  if (format === 'webm') {
    ffmpegArgs.push('-c:v', 'libvpx', '-c:a', 'libvorbis');
  } else {
    ffmpegArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac');
  }
  ffmpegArgs.push('-shortest', outputName);

  statusEl.textContent = 'Mixing...';
  progressEl.value = 0;
  ffmpeg.setProgress(({ ratio }) => {
    progressEl.value = ratio * 100;
    statusEl.textContent = `Mixing ${Math.round(ratio * 100)}%`;
  });

  await ffmpeg.run(...ffmpegArgs);

  const data = ffmpeg.FS('readFile', outputName);
  const mimeType = format === 'webm' ? 'video/webm' : 'video/mp4';
  const url = URL.createObjectURL(new Blob([data.buffer], { type: mimeType }));
  downloadButton.href = url;
  downloadButton.download = outputName;
  downloadButton.textContent = `Download ${outputName}`;
  downloadButton.classList.remove('hidden');
  statusEl.textContent = 'Mix ready';
});

async function mixOnServer(outputName, videoStart, videoDuration) {
  const formData = new FormData();
  formData.append('video', videoFile);
  audioTracks.forEach((track) => {
    if (track && track.file) {
      formData.append('audio', track.file);
      formData.append('audioVolume', track.volume ?? 1.0);
      formData.append('audioStart', track.start ?? 0);
    }
  });
  if (recordedAudioFile && useRecordedVoice.checked) {
    formData.append('audio', recordedAudioFile);
    formData.append('audioVolume', 1.0);
    formData.append('audioStart', 0);
  }
  formData.append('muteVideoAudio', muteVideoAudio.checked ? 'true' : 'false');
  formData.append('output', outputName);
  formData.append('videoStart', videoStart);
  if (!Number.isNaN(videoDuration)) {
    formData.append('videoDuration', videoDuration);
  }

  if (serverMode) {
    statusEl.textContent = 'Uploading to server...';
  }
  const response = await fetch('/mix', { method: 'POST', body: formData });
  if (!response.ok) {
    const text = await response.text();
    statusEl.textContent = `Server mix failed: ${text}`;
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  downloadLinkEl.innerHTML = `<a href="${url}" download="${outputName}">Download ${outputName}</a>`;
  statusEl.textContent = 'Server mix complete';
}

async function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    statusEl.textContent = 'Microphone recording is not supported in this browser.';
    return;
  }
  if (!videoFile) {
    statusEl.textContent = 'Select a video first so you can preview it while recording.';
    return;
  }

  try {
    recordedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(recordedStream);
    const chunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' });
      recordedAudioFile = new File([blob], 'voice-recording.webm', { type: 'audio/webm' });
      recordedStatus.textContent = `Recorded voice ready (${Math.round(blob.size / 1024)} KB)`;
      useRecordedVoice.disabled = false;
      useRecordedVoice.checked = true;
      recordButton.disabled = false;
      stopRecordButton.disabled = true;
      redoRecordingButton.disabled = false;
      previewRecordedButton.disabled = false;
      statusEl.textContent = 'Voice recording ready. Add it to the mix or mute the video audio.';
      if (recordedStream) {
        recordedStream.getTracks().forEach((track) => track.stop());
        recordedStream = null;
      }
      if (videoPreview) {
        videoPreview.pause();
        videoPreview.currentTime = 0;
      }
      updateMixButton();
    };

    mediaRecorder.start();
    if (videoPreview) {
      videoPreview.muted = true;
      videoPreview.currentTime = 0;
      videoPreview.play().catch(() => {});
    }
    recordButton.disabled = true;
    stopRecordButton.disabled = false;
    recordedStatus.textContent = 'Recording...';
    statusEl.textContent = 'Recording voice while previewing video. Press stop when finished.';
  } catch (err) {
    statusEl.textContent = `Microphone error: ${err.message}`;
  }
}

videoPreview.addEventListener('error', () => {
  if (videoFile) {
    previewSupportEl.textContent = 'Preview support: this format cannot be played in browser. Recording and mixing still work.';
  }
});

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

function redoRecording() {
  recordedAudioFile = null;
  useRecordedVoice.checked = false;
  useRecordedVoice.disabled = true;
  previewRecordedButton.disabled = true;
  redoRecordingButton.disabled = true;
  recordedStatus.textContent = 'No voice recorded';
  statusEl.textContent = 'Ready to record again.';
  updateMixButton();
}

function previewRecordedVoice() {
  if (!recordedAudioFile) {
    statusEl.textContent = 'No voice recording available to preview.';
    return;
  }

  const previewUrl = URL.createObjectURL(recordedAudioFile);
  const audio = new Audio(previewUrl);
  audio.play();
  statusEl.textContent = 'Playing recorded voice preview.';
}

['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
  dropArea.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  }, false);
});

dropArea.addEventListener('dragover', () => {
  dropArea.classList.add('dragover');
}, false);

dropArea.addEventListener('dragleave', () => {
  dropArea.classList.remove('dragover');
}, false);

dropArea.addEventListener('drop', (event) => {
  dropArea.classList.remove('dragover');
  handleDrop(event.dataTransfer.files);
}, false);

// Robust download handler: covers blob URLs and remote URLs by fetching blob and forcing a download
downloadButton.addEventListener('click', async (e) => {
  try {
    e.preventDefault();
    const href = downloadButton.href;
    const filename = downloadButton.download || 'mixed-output.mp4';
    if (!href) return;
    // If it's already a blob: URL, trigger native download via temporary anchor
    if (href.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Download started');
      return;
    }

    // Otherwise fetch the resource and create a blob URL for reliable download
    statusEl.textContent = 'Preparing download...';
    const resp = await fetch(href);
    if (!resp.ok) {
      statusEl.textContent = `Download failed: ${resp.status}`;
      return;
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    statusEl.textContent = 'Download started';
    showToast('Download started');
  } catch (err) {
    statusEl.textContent = `Download error: ${err.message}`;
  }
});

// Delegate download links created inside downloadLinkEl (server mode)
downloadLinkEl.addEventListener('click', async (e) => {
  const target = e.target;
  if (target && target.tagName === 'A') {
    e.preventDefault();
    const href = target.href;
    const filename = target.getAttribute('download') || 'mixed-output';
    if (!href) return;
    try {
      statusEl.textContent = 'Preparing download...';
      const resp = await fetch(href);
      if (!resp.ok) { statusEl.textContent = `Download failed: ${resp.status}`; return; }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      statusEl.textContent = 'Download started';
      showToast('Download started');
    } catch (err) {
      statusEl.textContent = `Download error: ${err.message}`;
    }
  }
});

// Small toast helper
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

// Ensure placeholder state is correct on load
updateAudioPlaceholder();
