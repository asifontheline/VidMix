const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../shared/mix-engine');

test('normalizeTrack uses role-based defaults', () => {
  const voice = engine.normalizeTrack({ role: 'voice' }, 0);
  const background = engine.normalizeTrack({ role: 'background' }, 1);

  assert.equal(voice.role, 'voice');
  assert.equal(voice.volume, 1.0);
  assert.equal(background.role, 'background');
  assert.equal(background.volume, 0.5);
});

test('selectActiveTracks drops muted/pathless tracks and honors solo', () => {
  const tracks = [
    engine.normalizeTrack({ name: 'a.wav', role: 'voice' }, 0),
    engine.normalizeTrack({ name: 'b.wav', role: 'background', mute: true }, 1),
    engine.normalizeTrack({ name: null, role: 'voice' }, 2)
  ];
  const active = engine.selectActiveTracks(tracks);
  assert.equal(active.length, 1);
  assert.equal(active[0].name, 'a.wav');

  const soloTracks = [
    engine.normalizeTrack({ name: 'a.wav', role: 'voice' }, 0),
    engine.normalizeTrack({ name: 'b.wav', role: 'background', solo: true }, 1)
  ];
  const soloed = engine.selectActiveTracks(soloTracks);
  assert.equal(soloed.length, 1);
  assert.equal(soloed[0].name, 'b.wav');
});

test('buildMixArgs builds a single-input map without filter_complex', () => {
  const args = engine.buildMixArgs({
    videoInput: 'video.mp4',
    tracks: [{ name: 'voice.wav', role: 'voice' }],
    muteVideoAudio: false,
    outputName: 'out.mp4'
  });

  assert.equal(args.includes('-filter_complex'), true);
  assert.ok(args.join(' ').includes('amix=inputs=2'));
  assert.ok(args.includes('out.mp4'));
});

test('buildMixArgs maps single active audio stream directly when no processing needed', () => {
  const args = engine.buildMixArgs({
    videoInput: 'video.mp4',
    tracks: [],
    muteVideoAudio: false,
    outputName: 'out.mp4'
  });
  const joined = args.join(' ');
  assert.equal(args.includes('-filter_complex'), false);
  assert.ok(joined.includes('-map 0:a'));
});

test('buildMixArgs mutes audio entirely with -an when no tracks and muted video audio', () => {
  const args = engine.buildMixArgs({
    videoInput: 'video.mp4',
    tracks: [],
    muteVideoAudio: true,
    outputName: 'out.mp4'
  });
  assert.ok(args.includes('-an'));
});

test('buildMixArgs applies volume, start delay, and fades for a track', () => {
  const args = engine.buildMixArgs({
    videoInput: 'video.mp4',
    tracks: [{ name: 'bg.wav', role: 'background', volume: 0.4, start: 2, duration: 10, fadeIn: 1, fadeOut: 1 }],
    muteVideoAudio: true,
    outputName: 'out.mp4'
  });
  const filterIdx = args.indexOf('-filter_complex');
  const filter = args[filterIdx + 1];
  assert.match(filter, /volume=0\.4/);
  assert.match(filter, /afade=t=in:st=0:d=1/);
  assert.match(filter, /afade=t=out:st=9:d=1/);
  assert.match(filter, /adelay=2000\|2000:all=1/);
});

test('buildMixArgs applies ducking window for background tracks under voice', () => {
  const args = engine.buildMixArgs({
    videoInput: 'video.mp4',
    tracks: [
      { name: 'voice.wav', role: 'voice', start: 1, duration: 4 },
      { name: 'bg.wav', role: 'background', duck: true }
    ],
    muteVideoAudio: true,
    outputName: 'out.mp4'
  });
  const filterIdx = args.indexOf('-filter_complex');
  const filter = args[filterIdx + 1];
  assert.match(filter, /between\(t,1,5\)/);
});

test('buildMixArgs supports audio-only export formats', () => {
  const args = engine.buildMixArgs({
    videoInput: 'video.mp4',
    tracks: [{ name: 'voice.wav', role: 'voice' }],
    muteVideoAudio: true,
    outputName: 'out.mp3',
    format: 'mp3'
  });
  assert.equal(args.includes('-shortest'), false);
  assert.ok(args.includes('-vn'));
  assert.ok(!args.includes('0:v:0'));
});

test('buildMixArgs throws for audio-only export with no active tracks', () => {
  assert.throws(() => {
    engine.buildMixArgs({
      videoInput: 'video.mp4',
      tracks: [],
      muteVideoAudio: true,
      outputName: 'out.mp3',
      format: 'mp3'
    });
  });
});

test('buildMixArgs applies resolution scaling via filter_complex', () => {
  const args = engine.buildMixArgs({
    videoInput: 'video.mp4',
    tracks: [],
    muteVideoAudio: true,
    outputName: 'out.mp4',
    resolution: '720p'
  });
  const filterIdx = args.indexOf('-filter_complex');
  assert.match(args[filterIdx + 1], /scale=-2:720/);
  assert.ok(args.includes('[vout]'));
});
