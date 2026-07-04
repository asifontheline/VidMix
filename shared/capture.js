/**
 * Point-and-shoot capture: camera (front/back on mobile), mic-only, and
 * screen recording, all via getUserMedia/getDisplayMedia + MediaRecorder.
 * Produces a plain File the mixer can use exactly like an uploaded one -
 * nothing is ever sent anywhere.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VidMixCapture = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isCameraSupported() {
    return !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function isScreenCaptureSupported() {
    return !!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  }

  function pickMimeType(kind) {
    var videoCandidates = [
      'video/mp4;codecs=avc1',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ];
    var audioCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    var candidates = kind === 'audio' ? audioCandidates : videoCandidates;
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    for (var i = 0; i < candidates.length; i++) {
      if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return '';
  }

  // facingMode: 'user' (front) or 'environment' (back, typical on phones).
  function openCameraStream(options) {
    var opts = options || {};
    var facingMode = opts.facingMode || 'user';
    var withAudio = opts.withAudio !== false;
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } },
      audio: withAudio
    });
  }

  function openMicStream() {
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }

  function openScreenStream(options) {
    var opts = options || {};
    if (!isScreenCaptureSupported()) {
      return Promise.reject(new Error('Screen capture is not supported in this browser.'));
    }
    return navigator.mediaDevices.getDisplayMedia({ video: true, audio: opts.withAudio !== false });
  }

  function stopStream(stream) {
    if (!stream) return;
    stream.getTracks().forEach(function (track) { track.stop(); });
  }

  function extensionFor(mimeType, kind) {
    if (mimeType.indexOf('mp4') !== -1) return kind === 'video' ? '.mp4' : '.m4a';
    if (mimeType.indexOf('ogg') !== -1) return '.ogg';
    return '.webm';
  }

  function Recorder(stream, options) {
    var opts = options || {};
    this.kind = opts.kind || (stream.getVideoTracks().length > 0 ? 'video' : 'audio');
    this.mimeType = opts.mimeType || pickMimeType(this.kind);
    this.chunks = [];
    this.recorder = this.mimeType
      ? new MediaRecorder(stream, { mimeType: this.mimeType })
      : new MediaRecorder(stream);
    this._stopPromise = null;

    var self = this;
    this.recorder.ondataavailable = function (event) {
      if (event.data && event.data.size > 0) self.chunks.push(event.data);
    };
  }

  Recorder.prototype.start = function (timesliceMs) {
    this.chunks = [];
    this._stopPromise = null;
    this.recorder.start(timesliceMs);
  };

  Recorder.prototype.stop = function () {
    if (this._stopPromise) return this._stopPromise;
    var self = this;
    this._stopPromise = new Promise(function (resolve) {
      self.recorder.addEventListener('stop', function () {
        var type = self.mimeType || (self.kind === 'video' ? 'video/webm' : 'audio/webm');
        var blob = new Blob(self.chunks, { type: type });
        var ext = extensionFor(type, self.kind);
        var file = new File([blob], 'capture-' + Date.now() + ext, { type: type });
        resolve(file);
      }, { once: true });
      if (self.recorder.state !== 'inactive') self.recorder.stop();
    });
    return this._stopPromise;
  };

  Object.defineProperty(Recorder.prototype, 'state', {
    get: function () { return this.recorder.state; }
  });

  return {
    isCameraSupported: isCameraSupported,
    isScreenCaptureSupported: isScreenCaptureSupported,
    pickMimeType: pickMimeType,
    openCameraStream: openCameraStream,
    openMicStream: openMicStream,
    openScreenStream: openScreenStream,
    stopStream: stopStream,
    Recorder: Recorder
  };
});
