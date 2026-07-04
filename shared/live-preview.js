/**
 * Live preview mixer - lets the user hear an approximation of the final mix
 * (volume, fades, start offsets, ducking) while scrubbing/playing the source
 * video, without invoking ffmpeg. Shared between the browser app and the
 * Electron renderer (both are Chromium contexts with Web Audio + <audio>).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.VidMixLivePreview = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function LivePreviewMixer(videoEl, audioContext) {
    this.video = videoEl;
    this.ctx = audioContext;
    this.lanes = new Map(); // id -> { audioEl, source, gain, config }
    this._raf = null;
    this._onTick = this._tick.bind(this);
    this._videoSource = null;
    this._videoGain = null;
  }

  LivePreviewMixer.prototype._ensureVideoRouted = function () {
    if (this._videoSource || !this.video) return;
    try {
      this._videoSource = this.ctx.createMediaElementSource(this.video);
      this._videoGain = this.ctx.createGain();
      this._videoSource.connect(this._videoGain).connect(this.ctx.destination);
    } catch (err) {
      // Already routed elsewhere, or CORS-tainted source; ignore.
    }
  };

  LivePreviewMixer.prototype.setVideoMuted = function (muted) {
    this._ensureVideoRouted();
    if (this._videoGain) this._videoGain.gain.value = muted ? 0 : 1;
  };

  // config: { id, url, volume, start, duration, fadeIn, fadeOut, mute, solo, duck, role }
  LivePreviewMixer.prototype.setLane = function (config) {
    var lane = this.lanes.get(config.id);
    if (!lane) {
      var audioEl = new Audio();
      audioEl.src = config.url;
      audioEl.preload = 'auto';
      audioEl.crossOrigin = 'anonymous';
      var source = this.ctx.createMediaElementSource(audioEl);
      var gain = this.ctx.createGain();
      source.connect(gain).connect(this.ctx.destination);
      lane = { audioEl: audioEl, source: source, gain: gain, config: config };
      this.lanes.set(config.id, lane);
    } else {
      if (lane.config.url !== config.url) {
        lane.audioEl.src = config.url;
      }
      lane.config = config;
    }
    return lane;
  };

  LivePreviewMixer.prototype.removeLane = function (id) {
    var lane = this.lanes.get(id);
    if (!lane) return;
    try {
      lane.audioEl.pause();
      lane.source.disconnect();
      lane.gain.disconnect();
    } catch (err) { /* noop */ }
    this.lanes.delete(id);
  };

  LivePreviewMixer.prototype._isActive = function (config, videoTime) {
    var localTime = videoTime - config.start;
    return localTime >= 0 && (typeof config.duration !== 'number' || localTime <= config.duration);
  };

  LivePreviewMixer.prototype._gainFor = function (config, videoTime, voiceActive) {
    if (config.mute) return 0;
    if (!this._isActive(config, videoTime)) return 0;
    var localTime = videoTime - config.start;

    var vol = typeof config.volume === 'number' ? config.volume : 1;
    if (config.fadeIn && localTime < config.fadeIn) {
      vol *= localTime / config.fadeIn;
    }
    if (config.fadeOut && typeof config.duration === 'number') {
      var fadeStart = config.duration - config.fadeOut;
      if (localTime > fadeStart) {
        vol *= Math.max(0, (config.duration - localTime) / config.fadeOut);
      }
    }
    if (config.duck && config.role === 'background' && voiceActive) {
      vol *= (typeof config.duckFactor === 'number' ? config.duckFactor : 0.35);
    }
    return Math.max(0, vol);
  };

  LivePreviewMixer.prototype._tick = function () {
    var videoTime = this.video.currentTime;
    var anySolo = false;
    var voiceActive = false;
    var self = this;

    this.lanes.forEach(function (lane) {
      var c = lane.config;
      if (c.solo) anySolo = true;
      if (c.role === 'voice' && !c.mute && self._isActive(c, videoTime)) voiceActive = true;
    });

    this.lanes.forEach(function (lane) {
      var config = lane.config;
      var audible = !anySolo || config.solo;
      var targetGain = audible ? self._gainFor(config, videoTime, voiceActive) : 0;
      lane.gain.gain.value = targetGain;

      var withinRange = self._isActive(config, videoTime);
      var localTime = videoTime - config.start;

      if (withinRange && !self.video.paused) {
        if (lane.audioEl.paused) {
          lane.audioEl.currentTime = Math.max(0, localTime);
          lane.audioEl.play().catch(function () {});
        } else if (Math.abs(lane.audioEl.currentTime - localTime) > 0.25) {
          lane.audioEl.currentTime = Math.max(0, localTime);
        }
      } else if (!lane.audioEl.paused) {
        lane.audioEl.pause();
      }
    });

    this._raf = requestAnimationFrame(this._onTick);
  };

  LivePreviewMixer.prototype.start = function () {
    this._ensureVideoRouted();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this._raf) this._raf = requestAnimationFrame(this._onTick);
  };

  LivePreviewMixer.prototype.stop = function () {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this.lanes.forEach(function (lane) { lane.audioEl.pause(); });
  };

  LivePreviewMixer.prototype.dispose = function () {
    this.stop();
    var self = this;
    this.lanes.forEach(function (_, id) { self.removeLane(id); });
  };

  return { LivePreviewMixer: LivePreviewMixer };
});
