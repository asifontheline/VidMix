# VidMix Studio (web)

The browser app - a full point-and-shoot video/audio mixing editor that runs entirely client-side via `ffmpeg.wasm`. Nothing is ever uploaded anywhere.

## Run locally

From the `vidmix/VidMix` project root (not from inside `web/` - the app loads shared code from `../shared`, which needs to stay reachable from the server root):

```bash
python3 server.py
```

Then open `http://localhost:8000/web/`.

A plain static server works too, as long as it's rooted at the project root:

```bash
npx serve .
```

## What it does

- **Capture** - record straight from your camera (front/back on mobile), screen, or mic via `getUserMedia`/`getDisplayMedia` + `MediaRecorder`.
- **Music library** - procedurally generated, royalty-free background beds (no external files, no licensing to track).
- **Multi-track mixer** - waveform display, per-lane volume/fade in/out/mute/solo, drag-to-reorder, "duck under voice" auto-ducking, a draggable timeline trim ruler.
- **Live preview** - hear an approximation of the mix (volumes, fades, ducking) before running the actual export.
- **Export** - MP4/WebM/MOV (or MP3/WAV audio-only), resolution and quality presets, all rendered locally by `ffmpeg.wasm`.

Installable as a PWA (`manifest.json` + `service-worker.js`) - "Add to Home Screen" on iOS/Android, or install from the browser's menu on desktop.

## Browser support

- Best in Chrome, Firefox, or Edge. Safari works but may be slower or hit memory limits on very large files.
- Camera/mic/screen capture require a secure context (`https://`, `localhost`, or the Electron shell).
