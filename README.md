# VidMix Studio

A full point-and-shoot video and audio mixing editor that runs entirely in the browser. Record from your camera, screen, or mic, layer in audio and procedurally generated background music, mix with waveforms/fades/ducking, and export - all client-side via `ffmpeg.wasm`. **No file is ever uploaded to a server.**

The web app (`web/`) is the single canonical codebase. The Electron app (`main.js`) is a thin native shell around it, for a Mac desktop build - it shares the exact same code and behavior, so there's only one app to maintain.

## Run it

**Website** (works on Mac/Windows/Linux/Android/iPhone, in the browser):

```bash
python3 server.py
```

Then open `http://localhost:8000/web/`. See [`web/README.md`](web/README.md) for details, or `npx serve .` as an alternative static server.

It's installable as a PWA - "Add to Home Screen" on iOS/Android puts a full-screen app icon on the device; desktop browsers offer an "Install" option too.

**Mac desktop app** (Electron):

```bash
npm install
npm start
```

## How it works

- **Capture**: record video from your camera (front/back switch on mobile) or screen, or record mic-only audio, straight in the browser via `getUserMedia`/`getDisplayMedia` + `MediaRecorder`.
- **Music library**: a handful of mood presets (calm, upbeat, cinematic, lo-fi) synthesized locally with Web Audio - royalty-free by construction, no downloads or attribution needed.
- **Multi-track mixer**: one video plus unlimited audio lanes, each with a waveform, volume, start offset, fade in/out, mute/solo, and "duck under voice." Drag lanes to reorder. Drag the timeline ruler to trim the video.
- **Live preview**: play the source video with an approximate real-time mix (Web Audio gain nodes) before spending time on an actual export.
- **Export**: MP4/WebM/MOV or MP3/WAV (audio-only), with resolution and quality presets, rendered by `ffmpeg.wasm` - entirely on-device.

## Project layout

- `shared/` - the mixing engine, waveform/decoding, live-preview mixer, capture, and music-generator modules. Pure logic, used identically by the web app and (via the same web assets) the Electron shell.
- `web/` - the app itself: `index.html`, `app.js`, `styles.css`, PWA manifest/service worker/icons, and `vendor/` (ffmpeg.wasm, vendored locally rather than loaded from a CDN - keeps the worker same-origin and lets the service worker cache it for offline use).
- `main.js` - Electron shell; just opens `web/index.html` in a native window and grants camera/mic permission.
- `server.py` - a dependency-free static file server for local testing (no upload endpoint).
- `test/` - unit tests for the mixing engine (`node --test test/`).

## Requirements

- A modern browser (Chrome, Firefox, Edge, or recent Safari) for WebAssembly and `MediaRecorder`.
- Node.js + npm only if you want the Electron desktop build.
- Python 3 only if you want to use `server.py` instead of another static file server.
