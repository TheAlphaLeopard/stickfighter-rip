/* audio.js — tiny WebAudio synth for hits, whooshes and the title loop.
   All sound is generated at runtime: no audio files to ship. */
(function (SF) {
  'use strict';

  var Audio = {
    ctx: null,
    master: null,
    musicGain: null,
    enabled: true,
    musicOn: true,
    ready: false,
    _step: 0,
    _timer: null
  };

  Audio.init = function () {
    if (Audio.ctx) return;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) { Audio.enabled = false; return; }
    try {
      Audio.ctx = new Ctor();
    } catch (e) {
      Audio.enabled = false;
      return;
    }
    Audio.master = Audio.ctx.createGain();
    Audio.master.gain.value = 0.5;
    Audio.master.connect(Audio.ctx.destination);
    Audio.musicGain = Audio.ctx.createGain();
    Audio.musicGain.gain.value = 0.16;
    Audio.musicGain.connect(Audio.master);
    Audio.ready = true;
  };

  Audio.resume = function () {
    Audio.init();
    if (Audio.ctx && Audio.ctx.state === 'suspended') Audio.ctx.resume();
  };

  function now() { return Audio.ctx.currentTime; }

  function tone(opts) {
    if (!Audio.enabled || !Audio.ctx) return;
    var t0 = now() + (opts.delay || 0);
    var osc = Audio.ctx.createOscillator();
    var gain = Audio.ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.from, t0);
    if (opts.to && opts.to !== opts.from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + opts.dur);
    }
    var vol = opts.vol == null ? 0.3 : opts.vol;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(gain);
    gain.connect(opts.bus || Audio.master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  function noise(opts) {
    if (!Audio.enabled || !Audio.ctx) return;
    var dur = opts.dur || 0.12;
    var len = Math.max(1, Math.floor(Audio.ctx.sampleRate * dur));
    var buf = Audio.ctx.createBuffer(1, len, Audio.ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    var src = Audio.ctx.createBufferSource();
    src.buffer = buf;
    var filter = Audio.ctx.createBiquadFilter();
    filter.type = opts.filter || 'bandpass';
    filter.frequency.value = opts.freq || 900;
    filter.Q.value = opts.q || 0.9;
    var gain = Audio.ctx.createGain();
    gain.gain.value = opts.vol == null ? 0.25 : opts.vol;
    gain.gain.exponentialRampToValueAtTime(0.0001, now() + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(Audio.master);
    src.start();
  }

  Audio.sfx = function (name) {
    if (!Audio.enabled) return;
    Audio.resume();
    switch (name) {
      case 'whoosh':
        noise({ dur: 0.13, freq: 1500, q: 0.6, vol: 0.16, filter: 'highpass' });
        break;
      case 'hit':
        tone({ type: 'square', from: 190, to: 70, dur: 0.12, vol: 0.22 });
        noise({ dur: 0.09, freq: 420, vol: 0.2 });
        break;
      case 'heavy':
        tone({ type: 'sawtooth', from: 130, to: 44, dur: 0.22, vol: 0.26 });
        noise({ dur: 0.18, freq: 260, vol: 0.26, filter: 'lowpass' });
        break;
      case 'block':
        tone({ type: 'triangle', from: 720, to: 480, dur: 0.09, vol: 0.16 });
        noise({ dur: 0.07, freq: 2600, vol: 0.1, filter: 'highpass' });
        break;
      case 'whiff':
        noise({ dur: 0.11, freq: 900, vol: 0.07, filter: 'highpass' });
        break;
      case 'jump':
        tone({ type: 'sine', from: 320, to: 620, dur: 0.11, vol: 0.12 });
        break;
      case 'land':
        noise({ dur: 0.08, freq: 180, vol: 0.16, filter: 'lowpass' });
        break;
      case 'special':
        tone({ type: 'sawtooth', from: 220, to: 880, dur: 0.3, vol: 0.2 });
        tone({ type: 'sine', from: 660, to: 1320, dur: 0.32, vol: 0.1, delay: 0.04 });
        break;
      case 'orbfire':
        tone({ type: 'triangle', from: 880, to: 330, dur: 0.2, vol: 0.16 });
        break;
      case 'ko':
        tone({ type: 'sawtooth', from: 300, to: 50, dur: 0.6, vol: 0.3 });
        tone({ type: 'sine', from: 150, to: 40, dur: 0.8, vol: 0.22 });
        break;
      case 'select':
        tone({ type: 'square', from: 620, to: 880, dur: 0.07, vol: 0.12 });
        break;
      case 'confirm':
        tone({ type: 'triangle', from: 520, to: 960, dur: 0.16, vol: 0.16 });
        break;
      case 'back':
        tone({ type: 'triangle', from: 520, to: 300, dur: 0.12, vol: 0.13 });
        break;
      case 'win':
        [523, 659, 784, 1046].forEach(function (f, i) {
          tone({ type: 'triangle', from: f, to: f, dur: 0.22, vol: 0.16, delay: i * 0.11 });
        });
        break;
      case 'lose':
        [392, 330, 262].forEach(function (f, i) {
          tone({ type: 'sine', from: f, to: f * 0.98, dur: 0.3, vol: 0.16, delay: i * 0.16 });
        });
        break;
      default:
        break;
    }
  };

  /* Sparse two-bar loop; only runs on menus and gently under fights. */
  var BASS = [0, 0, 3, 0, 5, 0, 3, 0];
  var LEAD = [12, null, 15, 12, null, 10, 12, null, 7, null, 10, null, 12, 15, null, null];

  Audio.startMusic = function () {
    Audio.init();
    if (!Audio.ctx || !Audio.enabled || Audio._timer) return;
    Audio.musicOn = true;
    var beat = 150; /* ms per step => 100 BPM sixteenths */
    Audio._timer = setInterval(function () {
      if (!Audio.ready || !Audio.musicOn) return;
      if (Audio.ctx.state === 'suspended') return;
      var s = Audio._step % 16;
      if (s % 2 === 0) {
        var b = 55 * Math.pow(2, BASS[(s / 2) | 0] / 12);
        tone({ type: 'sine', from: b, to: b, dur: 0.24, vol: 0.16, bus: Audio.musicGain });
      }
      var l = LEAD[s];
      if (l != null) {
        var f = 220 * Math.pow(2, l / 12);
        tone({ type: 'square', from: f, to: f, dur: 0.14, vol: 0.05, bus: Audio.musicGain });
      }
      if (s === 0 || s === 8) noise({ dur: 0.1, freq: 120, vol: 0.08, filter: 'lowpass' });
      Audio._step++;
    }, beat);
  };

  Audio.stopMusic = function () {
    Audio.musicOn = false;
  };

  Audio.toggleMute = function () {
    Audio.enabled = !Audio.enabled;
    if (Audio.master) Audio.master.gain.value = Audio.enabled ? 0.5 : 0;
    return Audio.enabled;
  };

  SF.Audio = Audio;
})(window.SF = window.SF || {});
