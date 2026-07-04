/**
 * Waveform decoding + rendering, shared between the browser app (web/app.js)
 * and the Electron renderer (renderer.js) - both run in a Chromium context
 * with the Web Audio API and <canvas>, so this code is identical in both.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VidMixWaveform = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var sharedAudioContext = null;
  function getAudioContext() {
    if (!sharedAudioContext) {
      var Ctx = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
      sharedAudioContext = new Ctx();
    }
    return sharedAudioContext;
  }

  // Accepts a File/Blob, an ArrayBuffer, or a typed array and resolves an AudioBuffer.
  async function decodeToAudioBuffer(source, audioContext) {
    var ctx = audioContext || getAudioContext();
    var arrayBuffer;
    if (source instanceof ArrayBuffer) {
      arrayBuffer = source.slice(0);
    } else if (ArrayBuffer.isView(source)) {
      arrayBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    } else if (source && typeof source.arrayBuffer === 'function') {
      arrayBuffer = await source.arrayBuffer();
    } else {
      throw new Error('Unsupported audio source for decoding');
    }
    return ctx.decodeAudioData(arrayBuffer);
  }

  // Downsamples an AudioBuffer to `buckets` peak values (0..1) for fast canvas drawing.
  function computePeaks(audioBuffer, buckets) {
    var channelCount = audioBuffer.numberOfChannels;
    var length = audioBuffer.length;
    var samplesPerBucket = Math.max(1, Math.floor(length / buckets));
    var peaks = new Float32Array(buckets);
    var channelData = [];
    for (var c = 0; c < channelCount; c++) {
      channelData.push(audioBuffer.getChannelData(c));
    }

    for (var b = 0; b < buckets; b++) {
      var start = b * samplesPerBucket;
      var end = Math.min(length, start + samplesPerBucket);
      var peak = 0;
      for (var c2 = 0; c2 < channelCount; c2++) {
        var data = channelData[c2];
        for (var i = start; i < end; i++) {
          var abs = Math.abs(data[i]);
          if (abs > peak) peak = abs;
        }
      }
      peaks[b] = peak;
    }
    return peaks;
  }

  function drawWaveform(canvas, peaks, options) {
    var opts = options || {};
    var ctx = canvas.getContext('2d');
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    var width = canvas.clientWidth || canvas.width;
    var height = canvas.clientHeight || canvas.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var barColor = opts.color || '#2563eb';
    var mutedColor = opts.mutedColor || '#94a3b8';
    var playheadColor = opts.playheadColor || '#f97316';
    var mid = height / 2;
    var barWidth = width / peaks.length;

    ctx.fillStyle = opts.muted ? mutedColor : barColor;
    for (var i = 0; i < peaks.length; i++) {
      var amp = Math.max(0.02, peaks[i]);
      var barHeight = amp * height;
      var x = i * barWidth;
      ctx.fillRect(x, mid - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
    }

    if (typeof opts.playheadRatio === 'number' && opts.playheadRatio >= 0 && opts.playheadRatio <= 1) {
      ctx.fillStyle = playheadColor;
      ctx.fillRect(opts.playheadRatio * width, 0, 2, height);
    }
  }

  return {
    getAudioContext: getAudioContext,
    decodeToAudioBuffer: decodeToAudioBuffer,
    computePeaks: computePeaks,
    drawWaveform: drawWaveform
  };
});
