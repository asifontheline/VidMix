#!/usr/bin/env python3
"""Static file server for VidMix Studio - no dependencies, no upload endpoint.

All mixing happens client-side via ffmpeg.wasm; this only serves the static
files (web/ and shared/) since browsers need http(s) to allow camera/mic
capture, service workers, and cross-origin isolation-free ffmpeg.wasm loading.
"""
import http.server
import mimetypes
import os
import socketserver

PORT = int(os.environ.get("PORT", "8000"))
ROOT = os.path.dirname(os.path.abspath(__file__))

mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/javascript", ".js")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with ReusableTCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"VidMix Studio: http://localhost:{PORT}/web/")
        httpd.serve_forever()
