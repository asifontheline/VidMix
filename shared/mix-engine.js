/**
 * Shared mixing engine used by both the Electron app (main.js, via require)
 * and the browser app (web/app.js, via a <script> tag exposing window.VidMixEngine).
 * Pure logic only - no filesystem/ffmpeg-binary access - so it can run in either
 * a Node context or a browser context unchanged.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VidMixEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_DUCK_FACTOR = 0.35;
  var AUDIO_ONLY_FORMATS = { mp3: true, wav: true };

  var FORMATS = [
    { value: 'mp4', label: 'MP4 (H.264/AAC)' },
    { value: 'webm', label: 'WebM (VP9/Opus)' },
    { value: 'mov', label: 'MOV (H.264/AAC)' },
    { value: 'mp3', label: 'MP3 (audio only)' },
    { value: 'wav', label: 'WAV (audio only)' }
  ];

  var RESOLUTIONS = [
    { value: 'original', label: 'Original' },
    { value: '1080p', label: '1080p' },
    { value: '720p', label: '720p' },
    { value: '480p', label: '480p' }
  ];

  var QUALITY_PRESETS = {
    fast: ['-preset', 'veryfast', '-crf', '26'],
    balanced: ['-preset', 'medium', '-crf', '22'],
    high: ['-preset', 'slow', '-crf', '18']
  };

  function clampNumber(value, fallback, min, max) {
    var num = typeof value === 'number' && isFinite(value) ? value : fallback;
    if (typeof min === 'number' && num < min) num = min;
    if (typeof max === 'number' && num > max) num = max;
    return num;
  }

  function isAudioOnlyFormat(format) {
    return !!AUDIO_ONLY_FORMATS[format];
  }

  function normalizeTrack(track, index) {
    var role = track.role === 'background' ? 'background' : 'voice';
    return {
      name: track.name || track.path || null,
      label: track.label || (role === 'background' ? 'Background ' + (index + 1) : 'Voice ' + (index + 1)),
      role: role,
      volume: clampNumber(track.volume, role === 'background' ? 0.5 : 1.0, 0),
      start: clampNumber(track.start, 0, 0),
      duration: typeof track.duration === 'number' && track.duration > 0 ? track.duration : null,
      fadeIn: clampNumber(track.fadeIn, 0, 0),
      fadeOut: clampNumber(track.fadeOut, 0, 0),
      enabled: track.enabled !== false,
      mute: !!track.mute,
      solo: !!track.solo,
      duck: !!track.duck
    };
  }

  // Applies mute/solo rules: if any track is soloed, only soloed tracks play.
  function selectActiveTracks(tracks) {
    var normalized = (tracks || []).filter(Boolean);
    var enabled = normalized.filter(function (t) { return t.enabled !== false && !t.mute && t.name; });
    var soloed = enabled.filter(function (t) { return t.solo; });
    return soloed.length > 0 ? soloed : enabled;
  }

  function buildAudioFilterGraph(activeTracks, options) {
    var duckFactor = clampNumber(options.duckFactor, DEFAULT_DUCK_FACTOR, 0, 1);
    var voiceTracks = activeTracks.filter(function (t) { return t.role === 'voice'; });
    var filterParts = [];
    var mixLabels = [];

    if (options.includeVideoAudio) {
      mixLabels.push('0:a');
    }

    activeTracks.forEach(function (track, i) {
      var inputIdx = i + 1; // input 0 is always the video
      var steps = [];

      if (track.volume !== 1) steps.push('volume=' + track.volume);
      if (track.fadeIn > 0) steps.push('afade=t=in:st=0:d=' + track.fadeIn);
      if (track.fadeOut > 0 && track.duration) {
        var fadeStart = Math.max(0, track.duration - track.fadeOut);
        steps.push('afade=t=out:st=' + fadeStart + ':d=' + track.fadeOut);
      }
      if (track.start > 0) {
        var delayMs = Math.round(track.start * 1000);
        steps.push('adelay=' + delayMs + '|' + delayMs + ':all=1');
      }
      if (track.role === 'background' && track.duck && voiceTracks.length > 0) {
        voiceTracks.forEach(function (voice) {
          var vEnd = voice.duration ? voice.start + voice.duration : null;
          var cond = vEnd
            ? 'between(t,' + voice.start + ',' + vEnd + ')'
            : 'gte(t,' + voice.start + ')';
          steps.push("volume=enable='" + cond + "':volume=" + duckFactor);
        });
      }

      if (steps.length > 0) {
        filterParts.push('[' + inputIdx + ':a]' + steps.join(',') + '[a' + i + ']');
        mixLabels.push('a' + i);
      } else {
        mixLabels.push(inputIdx + ':a');
      }
    });

    if (mixLabels.length === 0) {
      return { filterComplex: null, mapArg: null };
    }
    if (mixLabels.length === 1 && filterParts.length === 0) {
      return { filterComplex: null, mapArg: mixLabels[0] };
    }
    if (mixLabels.length === 1) {
      var renamed = filterParts[0].replace(/\[a0\]$/, '[aout]');
      return { filterComplex: renamed, mapArg: '[aout]' };
    }
    var bracketed = mixLabels.map(function (l) { return '[' + l + ']'; }).join('');
    filterParts.push(bracketed + 'amix=inputs=' + mixLabels.length + ':duration=longest:dropout_transition=0[aout]');
    return { filterComplex: filterParts.join(';'), mapArg: '[aout]' };
  }

  function resolveVideoFilter(resolution) {
    if (!resolution || resolution === 'original') return null;
    var heights = { '1080p': 1080, '720p': 720, '480p': 480 };
    var h = heights[resolution];
    return h ? 'scale=-2:' + h : null;
  }

  function formatCodecArgs(format) {
    switch (format) {
      case 'webm':
        return ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-c:a', 'libopus'];
      case 'mov':
        return ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];
      case 'mp3':
        return ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'];
      case 'wav':
        return ['-vn', '-c:a', 'pcm_s16le'];
      case 'mp4':
      default:
        return ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];
    }
  }

  /**
   * Builds a flat ffmpeg CLI args array (no shell involved - pass directly to
   * child_process.spawn or ffmpeg.wasm's exec()).
   *
   * spec: {
   *   videoInput: string,          // path (Electron) or virtual FS name (browser)
   *   videoTrim: { start?, duration? },
   *   muteVideoAudio: boolean,
   *   tracks: [{ name, role, volume, start, duration, fadeIn, fadeOut, enabled, mute, solo, duck }],
   *   outputName: string,
   *   format: 'mp4'|'webm'|'mov'|'mp3'|'wav',
   *   resolution: 'original'|'1080p'|'720p'|'480p',
   *   quality: 'fast'|'balanced'|'high',
   *   duckFactor: number (0-1)
   * }
   */
  function buildMixArgs(spec) {
    var videoInput = spec.videoInput;
    var videoTrim = spec.videoTrim;
    var muteVideoAudio = spec.muteVideoAudio;
    var tracks = spec.tracks;
    var outputName = spec.outputName;
    var format = spec.format || 'mp4';
    var resolution = spec.resolution || 'original';
    var quality = spec.quality || 'balanced';
    var duckFactor = spec.duckFactor;

    if (!videoInput) throw new Error('videoInput is required');
    if (!outputName) throw new Error('outputName is required');

    var audioOnly = isAudioOnlyFormat(format);
    var normalizedTracks = (tracks || []).map(function (t, i) { return normalizeTrack(t, i); });
    var activeTracks = selectActiveTracks(normalizedTracks);
    var includeVideoAudio = !muteVideoAudio;
    var graph = buildAudioFilterGraph(activeTracks, { includeVideoAudio: includeVideoAudio, duckFactor: duckFactor });

    var args = ['-y'];
    if (videoTrim && typeof videoTrim.start === 'number' && videoTrim.start > 0) {
      args.push('-ss', String(videoTrim.start));
    }
    args.push('-i', videoInput);
    activeTracks.forEach(function (track) { args.push('-i', track.name); });
    if (videoTrim && typeof videoTrim.duration === 'number' && videoTrim.duration > 0) {
      args.push('-t', String(videoTrim.duration));
    }

    var videoFilter = audioOnly ? null : resolveVideoFilter(resolution);
    var filterComplex = graph.filterComplex;
    var videoMapArg = audioOnly ? null : '0:v:0';

    if (videoFilter) {
      var videoChain = '[0:v]' + videoFilter + '[vout]';
      filterComplex = filterComplex ? filterComplex + ';' + videoChain : videoChain;
      videoMapArg = '[vout]';
    }

    if (filterComplex) {
      args.push('-filter_complex', filterComplex);
    }
    if (!audioOnly) {
      args.push('-map', videoMapArg);
    }
    if (graph.mapArg) {
      args.push('-map', graph.mapArg);
    } else if (!audioOnly) {
      args.push('-an');
    }

    if (!graph.mapArg && audioOnly) {
      throw new Error('Audio-only export requires at least one active audio source.');
    }

    args.push.apply(args, formatCodecArgs(format));
    if (!audioOnly && (format === 'mp4' || format === 'mov')) {
      args.push.apply(args, QUALITY_PRESETS[quality] || QUALITY_PRESETS.balanced);
    }
    if (!audioOnly) {
      args.push('-shortest');
    }
    args.push(outputName);
    return args;
  }

  function defaultOutputName(baseName, format) {
    var safeBase = (baseName || 'mixed-output').replace(/\.[^.]+$/, '');
    return safeBase + '.' + format;
  }

  return {
    FORMATS: FORMATS,
    RESOLUTIONS: RESOLUTIONS,
    QUALITY_PRESETS: QUALITY_PRESETS,
    DEFAULT_DUCK_FACTOR: DEFAULT_DUCK_FACTOR,
    isAudioOnlyFormat: isAudioOnlyFormat,
    normalizeTrack: normalizeTrack,
    selectActiveTracks: selectActiveTracks,
    buildAudioFilterGraph: buildAudioFilterGraph,
    resolveVideoFilter: resolveVideoFilter,
    formatCodecArgs: formatCodecArgs,
    buildMixArgs: buildMixArgs,
    defaultOutputName: defaultOutputName
  };
});
