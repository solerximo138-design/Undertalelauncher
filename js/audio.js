/* SOUL LINK — original WebAudio chiptune and UI effects. */
(function () {
  'use strict';

  const BPM = 86;
  const STEP = 60 / BPM / 2;

  /* An original little loop. No borrowed melodies. */
  const BASS = [
    38, 0, 0, 0, 38, 0, 45, 0, 41, 0, 0, 0, 41, 0, 48, 0,
    36, 0, 0, 0, 36, 0, 43, 0, 41, 0, 0, 0, 45, 0, 43, 0
  ];
  const ARP = [
    62, 65, 69, 65, 62, 69, 65, 69, 65, 69, 72, 69, 65, 72, 69, 72,
    60, 64, 67, 64, 60, 67, 64, 67, 65, 69, 72, 69, 65, 72, 69, 65
  ];
  const PAD = [
    50, 0, 0, 0, 0, 0, 0, 0, 53, 0, 0, 0, 0, 0, 0, 0,
    48, 0, 0, 0, 0, 0, 0, 0, 53, 0, 0, 0, 0, 0, 0, 0
  ];

  function midi(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  class Engine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.comp = null;
      this.volumes = { master: 72, music: 35, sfx: 68 };
      this.muted = false;
      this.playing = false;
      this.timer = null;
      this.step = 0;
      this.nextTime = 0;
      this.unlocked = false;
      this.musicWanted = true;
      this.noiseBuffer = null;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(function () {});
        return this.ctx;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try {
        this.ctx = new Ctx();
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -18;
        this.comp.knee.value = 18;
        this.comp.ratio.value = 5;
        this.comp.attack.value = 0.002;
        this.comp.release.value = 0.22;
        this.master = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain.connect(this.comp);
        this.sfxGain.connect(this.comp);
        this.comp.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.applyVolumes();
        this.makeNoise();
        this.unlocked = true;
      } catch (_) {
        this.ctx = null;
      }
      return this.ctx;
    }

    makeNoise() {
      if (!this.ctx) return;
      const length = Math.floor(this.ctx.sampleRate * 0.25);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      this.noiseBuffer = buffer;
    }

    applyVolumes() {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const master = this.muted ? 0 : (this.volumes.master / 100) * 0.85;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(master, now, 0.05);
      this.musicGain.gain.setTargetAtTime((this.volumes.music / 100) * 0.32, now, 0.05);
      this.sfxGain.gain.setTargetAtTime((this.volumes.sfx / 100) * 0.55, now, 0.05);
    }

    setVolumes(next) {
      this.volumes.master = next.master != null ? next.master : this.volumes.master;
      this.volumes.music = next.music != null ? next.music : this.volumes.music;
      this.volumes.sfx = next.sfx != null ? next.sfx : this.volumes.sfx;
      this.muted = !!next.muted;
      this.applyVolumes();
      if (!this.muted && this.musicWanted) this.startMusic();
      if (this.muted) this.stopMusic(true);
    }

    setMuted(muted) {
      this.muted = !!muted;
      this.applyVolumes();
      if (!this.muted && this.musicWanted) this.startMusic();
      else this.stopMusic(true);
    }

    startMusic() {
      this.musicWanted = true;
      if (!this.ctx || this.muted) return;
      if (this.playing) return;
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(function () {});
      this.playing = true;
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.06;
      const self = this;
      this.timer = window.setInterval(function () { self.schedule(); }, 70);
      this.schedule();
    }

    stopMusic(immediate) {
      this.musicWanted = false;
      if (!this.playing) return;
      this.playing = false;
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      if (immediate) {
        try { this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03); } catch (_) {}
        const self = this;
        window.setTimeout(function () {
          if (!self.playing && self.musicGain) self.musicGain.gain.setTargetAtTime(0.32 * (self.volumes.music / 100), self.ctx.currentTime, 0.1);
        }, 220);
      }
    }

    schedule() {
      if (!this.ctx || !this.playing) return;
      const now = this.ctx.currentTime;
      while (this.nextTime < now + 0.18) {
        this.playStep(this.step, this.nextTime);
        this.step = (this.step + 1) % 32;
        this.nextTime += STEP;
      }
    }

    playStep(step, time) {
      const bassNote = BASS[step];
      const arpNote = ARP[step];
      const padNote = PAD[step];
      if (bassNote) this.note(midi(bassNote), time, STEP * 1.7, 'triangle', 0.34, this.musicGain);
      if (arpNote) this.note(midi(arpNote), time + 0.008, STEP * 0.78, 'square', 0.075, this.musicGain);
      if (padNote) this.note(midi(padNote), time, STEP * 3.5, 'sine', 0.11, this.musicGain);
      if (step % 8 === 4) this.note(midi(86), time, 0.04, 'square', 0.035, this.musicGain);
    }

    note(freq, when, duration, type, peak, destination) {
      if (!this.ctx || !destination) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, when);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(when);
      osc.stop(when + duration + 0.03);
    }

    slide(freq, to, when, duration, type, peak, destination) {
      if (!this.ctx || !destination) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, when);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), when + duration);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(when);
      osc.stop(when + duration + 0.03);
    }

    noise(when, duration, peak, destination, highpass) {
      if (!this.ctx || !this.noiseBuffer || !destination) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = highpass || 700;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(peak, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(destination);
      src.start(when);
      src.stop(when + duration);
    }

    sfx(name) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + 0.005;
      const out = this.sfxGain;
      switch (name) {
        case 'move':
          this.slide(320, 220, t, 0.06, 'square', 0.09, out);
          break;
        case 'confirm':
          this.slide(440, 660, t, 0.07, 'square', 0.12, out);
          this.slide(660, 880, t + 0.06, 0.08, 'square', 0.09, out);
          break;
        case 'back':
          this.slide(360, 180, t, 0.11, 'square', 0.1, out);
          break;
        case 'pickup':
          this.slide(660, 990, t, 0.09, 'triangle', 0.15, out);
          this.slide(990, 1320, t + 0.08, 0.13, 'triangle', 0.12, out);
          this.slide(1320, 1760, t + 0.16, 0.11, 'triangle', 0.08, out);
          break;
        case 'heal':
          this.slide(520, 780, t, 0.18, 'sine', 0.14, out);
          this.slide(780, 1040, t + 0.12, 0.2, 'sine', 0.09, out);
          break;
        case 'hurt':
          this.slide(150, 55, t, 0.2, 'sawtooth', 0.2, out);
          this.noise(t, 0.12, 0.12, out, 400);
          break;
        case 'battle':
          this.slide(90, 290, t, 0.28, 'sawtooth', 0.12, out);
          this.noise(t, 0.3, 0.04, out, 1800);
          break;
        case 'gate':
          this.slide(392, 784, t, 0.5, 'triangle', 0.13, out);
          this.slide(523, 1046, t + 0.1, 0.55, 'sine', 0.08, out);
          break;
        case 'error':
          this.slide(180, 120, t, 0.16, 'square', 0.14, out);
          break;
        case 'install':
          this.slide(523, 784, t, 0.12, 'square', 0.1, out);
          this.slide(784, 1046, t + 0.1, 0.16, 'square', 0.08, out);
          break;
        case 'delete':
          this.slide(260, 90, t, 0.2, 'square', 0.12, out);
          break;
        default:
          this.slide(440, 440, t, 0.04, 'square', 0.06, out);
      }
    }
  }

  const engine = new Engine();

  window.SL = window.SL || {};
  SL.audio = {
    engine: engine,
    init: function () { return engine.init(); },
    startMusic: function () { engine.init(); engine.startMusic(); },
    stopMusic: function (immediate) { engine.stopMusic(immediate); },
    setVolumes: function (volumes) { engine.init(); engine.setVolumes(volumes); },
    setMuted: function (muted) { engine.init(); engine.setMuted(muted); },
    sfx: function (name) { engine.init(); engine.sfx(name); },
    unlock: function () {
      engine.init();
      if (!engine.playing && !engine.muted) engine.startMusic();
    },
    get isPlaying() { return engine.playing; }
  };
})();
