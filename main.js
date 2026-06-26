const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('open-file', async (event, filters) => {
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters });
  return res.canceled ? [] : res.filePaths;
});

ipcMain.handle('save-dialog', async (event, defaultPath) => {
  const res = await dialog.showSaveDialog({ defaultPath });
  return res.canceled ? null : res.filePath;
});

ipcMain.handle('mix-media', async (event, { video, tracks, output, videoTrim }) => {
  return new Promise((resolve, reject) => {
    if (!video || !tracks || !tracks.length || !output) return reject(new Error('Missing paths or tracks'));

    const cmd = ffmpeg();

    // add video input
    cmd.input(video);
    if (videoTrim && typeof videoTrim.start === 'number') {
      cmd.inputOptions([`-ss ${videoTrim.start}`]);
    }
    if (videoTrim && typeof videoTrim.duration === 'number') {
      cmd.outputOptions([`-t ${videoTrim.duration}`]);
    }

    // add audio inputs
    tracks.forEach((t) => {
      cmd.input(t.path);
      if (t.start) {
        cmd.inputOptions([`-ss ${t.start}`]);
      }
    });

    // build complex filter for volumes + amix if multiple tracks
    if (tracks.length === 1) {
      // simple map
      cmd
        .outputOptions(['-c:v copy', '-c:a aac', '-map 0:v:0', '-map 1:a:0', '-shortest']);
    } else {
      const parts = [];
      const audioLabels = [];
      for (let i = 0; i < tracks.length; i++) {
        const inputIdx = i + 1; // video is 0
        const vol = typeof tracks[i].volume === 'number' ? tracks[i].volume : 1.0;
        parts.push(`[${inputIdx}:a]volume=${vol}[a${i}]`);
        audioLabels.push(`[a${i}]`);
      }
      parts.push(`${audioLabels.join('')}amix=inputs=${tracks.length}:duration=shortest[aout]`);

      cmd.complexFilter(parts.join(';'))
        .outputOptions(['-map 0:v:0', '-map [aout]', '-c:v copy', '-c:a aac', '-shortest']);
    }

    cmd.on('progress', progress => {
      event.sender.send('mix-progress', progress);
    })
      .on('end', () => resolve({ output }))
      .on('error', err => reject(err))
      .save(output);
  });
});
