const { ipcRenderer } = require('electron');

const chooseVideo = document.getElementById('chooseVideo');
const addAudio = document.getElementById('addAudio');
const saveAs = document.getElementById('saveAs');
const startMix = document.getElementById('startMix');

const videoPathEl = document.getElementById('videoPath');
const audioTracksContainer = document.getElementById('audioTracks');
const outputPathEl = document.getElementById('outputPath');
const progressEl = document.getElementById('progress');
const statusEl = document.getElementById('status');
const videoStartEl = document.getElementById('videoStart');
const videoDurationEl = document.getElementById('videoDuration');

let videoPath = null;
let audioTracks = [];
let outputPath = null;

chooseVideo.addEventListener('click', async () => {
  const files = await ipcRenderer.invoke('open-file', [
    { name: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'webm'] }
  ]);
  if (files && files[0]) {
    videoPath = files[0];
    videoPathEl.textContent = videoPath;
  }
});

function createAudioTrackRow(trackIdx) {
  const row = document.createElement('div');
  row.className = 'row';
  row.dataset.index = trackIdx;

  const chooseBtn = document.createElement('button');
  chooseBtn.textContent = 'Choose Audio';
  const pathSpan = document.createElement('span');
  pathSpan.className = 'path';
  pathSpan.style.maxWidth = '400px';

  const volLabel = document.createElement('label');
  volLabel.textContent = 'Vol:';
  const volInput = document.createElement('input');
  volInput.type = 'number';
  volInput.step = '0.1';
  volInput.min = '0';
  volInput.max = '10';
  volInput.value = '1.0';
  volInput.style.width = '80px';

  const startLabel = document.createElement('label');
  startLabel.textContent = 'Start:';
  const startInput = document.createElement('input');
  startInput.type = 'number';
  startInput.step = '0.1';
  startInput.min = '0';
  startInput.placeholder = 'sec';
  startInput.style.width = '80px';

  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove';

  row.appendChild(chooseBtn);
  row.appendChild(pathSpan);
  row.appendChild(volLabel);
  row.appendChild(volInput);
  row.appendChild(startLabel);
  row.appendChild(startInput);
  row.appendChild(removeBtn);

  chooseBtn.addEventListener('click', async () => {
    const files = await ipcRenderer.invoke('open-file', [
      { name: 'Audio', extensions: ['mp3', 'aac', 'wav', 'm4a', 'ogg'] }
    ]);
    if (files && files[0]) {
      audioTracks[trackIdx].path = files[0];
      pathSpan.textContent = files[0];
    }
  });

  volInput.addEventListener('input', () => {
    audioTracks[trackIdx].volume = parseFloat(volInput.value) || 1.0;
  });

  startInput.addEventListener('input', () => {
    audioTracks[trackIdx].start = parseFloat(startInput.value) || 0;
  });

  removeBtn.addEventListener('click', () => {
    audioTracks[trackIdx] = null;
    audioTracksContainer.removeChild(row);
  });

  audioTracksContainer.appendChild(row);
}

addAudio.addEventListener('click', () => {
  const idx = audioTracks.length;
  audioTracks.push({ path: null, volume: 1.0, start: 0 });
  createAudioTrackRow(idx);
});

saveAs.addEventListener('click', async () => {
  const defaultName = 'mixed-output.mp4';
  const out = await ipcRenderer.invoke('save-dialog', defaultName);
  if (out) {
    outputPath = out;
    outputPathEl.textContent = outputPath;
  }
});

startMix.addEventListener('click', async () => {
  if (!videoPath) {
    statusEl.textContent = 'Choose a video first.';
    return;
  }
  const validTracks = audioTracks.filter(t => t && t.path);
  if (validTracks.length === 0) {
    statusEl.textContent = 'Add at least one audio track.';
    return;
  }
  if (!outputPath) {
    // auto choose next to video
    const path = require('path');
    const dir = path.dirname(videoPath);
    outputPath = path.join(dir, path.basename(videoPath, path.extname(videoPath)) + '-mixed.mp4');
    outputPathEl.textContent = outputPath;
  }

  statusEl.textContent = 'Starting mix...';
  progressEl.value = 0;

  const videoTrim = {};
  if (videoStartEl.value) videoTrim.start = parseFloat(videoStartEl.value);
  if (videoDurationEl.value) videoTrim.duration = parseFloat(videoDurationEl.value);

  try {
    const result = await ipcRenderer.invoke('mix-media', { video: videoPath, tracks: validTracks, output: outputPath, videoTrim });
    statusEl.textContent = 'Mix completed: ' + result.output;
    progressEl.value = 100;
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
});

ipcRenderer.on('mix-progress', (event, p) => {
  if (p && p.percent) {
    progressEl.value = Math.round(p.percent);
    statusEl.textContent = `Progress: ${Math.round(p.percent)}%`;
  }
});
