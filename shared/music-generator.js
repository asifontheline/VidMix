/**
 * Procedural, royalty-free background music beds. Everything is synthesized
 * locally with Web Audio (OfflineAudioContext) - no external audio files, no
 * network fetches, so there's nothing to license or attribute.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VidMixMusicGenerator = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PRESETS = {
    calm: {
      label: 'Calm Ambient',
      tempo: 70,
      wave: 'sine',
      padGain: 0.18,
      percussion: false,
      filterFreq: 1200,
      chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]]
    },
    upbeat: {
      label: 'Upbeat Pop',
      tempo: 112,
      wave: 'triangle',
      padGain: 0.14,
      percussion: true,
      filterFreq: 3000,
      chords: [[60, 64, 67], [65, 69, 72], [57, 60, 64], [62, 65, 69]]
    },
    cinematic: {
      label: 'Cinematic',
      tempo: 60,
      wave: 'sawtooth',
      padGain: 0.12,
      percussion: false,
      filterFreq: 900,
      chords: [[48, 55, 60], [45, 52, 57], [43, 50, 55], [41, 48, 53]]
    },
    lofi: {
      label: 'Lo-fi Chill',
      tempo: 82,
      wave: 'sine',
      padGain: 0.16,
      percussion: true,
      filterFreq: 1600,
      chords: [[60, 63, 67], [58, 62, 65], [55, 58, 63], [53, 58, 60]]
    }
  };

  function listPresets() {
    return Object.keys(PRESETS).map(function (id) { return { id: id, label: PRESETS[id].label }; });
  }

  function noteToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function addShaker(ctx, destination, time) {
    var bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.06));
    var noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = noiseBuffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    var noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000;
    var g = ctx.createGain();
    g.gain.value = 0.05;
    noise.connect(hp).connect(g).connect(destination);
    noise.start(time);
  }

  function getOfflineContextCtor() {
    if (typeof OfflineAudioContext !== 'undefined') return OfflineAudioContext;
    if (typeof self !== 'undefined' && self.webkitOfflineAudioContext) return self.webkitOfflineAudioContext;
    return null;
  }

  /**
   * Renders a preset to a WAV Blob of the requested duration.
   * @param {string} presetId
   * @param {number} durationSeconds
   * @param {{ sampleRate?: number, gain?: number }} [options]
   * @returns {Promise<Blob>}
   */
  function renderPreset(presetId, durationSeconds, options) {
    var Ctor = getOfflineContextCtor();
    if (!Ctor) {
      return Promise.reject(new Error('OfflineAudioContext is not supported in this browser.'));
    }
    var preset = PRESETS[presetId] || PRESETS.calm;
    var opts = options || {};
    var sampleRate = opts.sampleRate || 44100;
    var duration = Math.max(1, durationSeconds || 30);
    var ctx = new Ctor(2, Math.ceil(sampleRate * duration), sampleRate);

    var masterGain = ctx.createGain();
    masterGain.gain.value = typeof opts.gain === 'number' ? opts.gain : 0.8;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = preset.filterFreq;
    masterGain.connect(filter);
    filter.connect(ctx.destination);

    var beatSeconds = 60 / preset.tempo;
    var barSeconds = beatSeconds * 4;
    var totalBars = Math.ceil(duration / barSeconds);

    for (var bar = 0; bar < totalBars; bar++) {
      var barStart = bar * barSeconds;
      if (barStart >= duration) break;
      var barEnd = Math.min(duration, barStart + barSeconds);
      var chord = preset.chords[bar % preset.chords.length];

      chord.forEach(function (midi, idx) {
        var osc = ctx.createOscillator();
        osc.type = preset.wave;
        osc.frequency.value = noteToFreq(midi);
        var g = ctx.createGain();
        var noteGain = preset.padGain / (idx === 0 ? 1 : 1.4);
        var attack = 0.6;
        var release = 0.8;
        g.gain.setValueAtTime(0, barStart);
        g.gain.linearRampToValueAtTime(noteGain, Math.min(duration, barStart + attack));
        g.gain.setValueAtTime(noteGain, Math.max(barStart, barEnd - release));
        g.gain.linearRampToValueAtTime(0, barEnd);
        osc.connect(g).connect(masterGain);
        osc.start(barStart);
        osc.stop(Math.min(duration, barEnd + 0.05));
      });

      var bassOsc = ctx.createOscillator();
      bassOsc.type = 'sine';
      bassOsc.frequency.value = noteToFreq(chord[0] - 12);
      var bassGain = ctx.createGain();
      bassGain.gain.setValueAtTime(0, barStart);
      bassGain.gain.linearRampToValueAtTime(preset.padGain * 0.9, Math.min(duration, barStart + 0.3));
      bassGain.gain.setValueAtTime(preset.padGain * 0.9, Math.max(barStart, barEnd - 0.3));
      bassGain.gain.linearRampToValueAtTime(0, barEnd);
      bassOsc.connect(bassGain).connect(masterGain);
      bassOsc.start(barStart);
      bassOsc.stop(Math.min(duration, barEnd + 0.05));

      if (preset.percussion) {
        for (var beat = 0; beat < 4; beat++) {
          var t = barStart + beat * beatSeconds;
          if (t >= duration) break;
          addShaker(ctx, masterGain, t);
        }
      }
    }

    return ctx.startRendering().then(function (renderedBuffer) {
      return audioBufferToWavBlob(renderedBuffer);
    });
  }

  function writeString(view, offset, str) {
    for (var i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  function audioBufferToWavBlob(buffer) {
    var numChannels = buffer.numberOfChannels;
    var sampleRate = buffer.sampleRate;
    var bitDepth = 16;
    var bytesPerSample = bitDepth / 8;
    var blockAlign = numChannels * bytesPerSample;
    var dataLength = buffer.length * blockAlign;
    var arrayBuffer = new ArrayBuffer(44 + dataLength);
    var view = new DataView(arrayBuffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    var channelData = [];
    for (var c = 0; c < numChannels; c++) channelData.push(buffer.getChannelData(c));

    var offset = 44;
    for (var i = 0; i < buffer.length; i++) {
      for (var ch = 0; ch < numChannels; ch++) {
        var sample = Math.max(-1, Math.min(1, channelData[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  return {
    listPresets: listPresets,
    renderPreset: renderPreset
  };
});
