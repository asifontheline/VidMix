# VidMix Web

This web version of VidMix runs in the browser using WebAssembly (`@ffmpeg/ffmpeg`).

## Run locally

```bash
cd vidmix/VidMix/web
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Run with Python server fallback

From `vidmix/VidMix`:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

Then open `http://localhost:8000`.

Browser support:
- Best in Chrome, Firefox, or Edge.
- Safari is supported on recent versions, but may be slower or hit memory limits for larger files.
- If the browser cannot run WebAssembly mixing, use `Server` mode.

Audio support:
- Audio tracks support MP3, AAC, WAV, FLAC, OGG, OPUS, M4A, AIFF, ALAC, and other FFmpeg-compatible audio formats.
- Each audio track can optionally have a volume multiplier and start offset.
- Recorded voice is included as an additional mix track when enabled.

Notes:
- Choose `Browser` mode to mix files locally in the browser using WebAssembly.
- Choose `Server` mode to upload files to the Python backend and download the mixed result.
- The server backend requires `ffmpeg` installed and available on the system path.
