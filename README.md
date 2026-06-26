# VidMix

Minimal Electron-based local media mixer. This app lets you pick video and audio files on your drive, mix them together (audio over video) using your system `ffmpeg`, and save the output back to disk.

## Requirements
- macOS (or platform supported by Electron)
- Node.js and npm
- `ffmpeg` available on PATH. Install via Homebrew:

```bash
brew install ffmpeg
```

## Setup

From the `vidmix/VidMix` folder:

```bash
npm install
npm start
```

## How it works
- Choose a video file using the UI.
- Add one or more audio tracks using `Add Audio Track`. For each track you can choose a file, set a start offset (seconds) and a volume multiplier.
- Optionally set `Video Trim` start/duration to export a clip from the source video.
- Choose an output path (or it will auto-pick a filename next to the chosen video).
- Click `Start Mix` — progress is shown and the resulting file is written to disk.

## Web-hosted version
A browser-hosted version is available in `vidmix/VidMix/web`.

### Run locally
Open `vidmix/VidMix/web/index.html` in a browser, or serve it with a static server:

```bash
cd vidmix/VidMix/web
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

### How it works
- The web UI uses `@ffmpeg/ffmpeg` (WebAssembly) to run mixing in the browser.
- Select a video and an audio file from your drive.
- Optionally set output filename and video trim values.
- Click `Load FFmpeg`, then `Start Mix`.
- Download the mixed `.mp4` when ready.

### Notes
- All processing happens in the browser; files are never uploaded to a server.
- This is a lightweight hosted scaffold. For production, consider adding drag-and-drop, multi-track support, and better progress/error handling.

