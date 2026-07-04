const { app, BrowserWindow, session } = require('electron');
const path = require('path');

const ALLOWED_MEDIA_PERMISSIONS = new Set(['media', 'mediaKeySystem']);

// VidMix desktop is a thin native shell around the web app (web/index.html).
// All mixing/recording logic lives in one place - web/ - and runs the same
// way here as it does in a browser: entirely client-side via ffmpeg.wasm,
// with no server round-trip for user media.
function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  win.loadFile(path.join(__dirname, 'web', 'index.html'));
}

app.whenReady().then(() => {
  // Camera/mic recording (getUserMedia) needs an explicit grant in Electron;
  // scope it to just media so we're not rubber-stamping every permission.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(ALLOWED_MEDIA_PERMISSIONS.has(permission));
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
