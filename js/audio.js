const NOTE = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

const MENU_LEAD = [
  62, 65, 69, 65, 64, 67, 69, null,
  62, 65, 69, 72, 69, 65, 64, 62,
  65, 69, 72, 69, 67, 65, 64, null,
  62, 64, 65, 67, 69, 72, 74, null
];
const MENU_BASS = [38, null, null, null, 41, null, null, null, 36, null, null, null, 41, null, null, null];

const GAME_LEAD = [
  69, 72, 76, 72, 74, 72, 69, 67,
  69, 72, 76, 79, 76, 72, 69, 67,
  65, 69, 72, 69, 67, 65, 64, 62,
  69, 72, 74, 76, 74, 72, 69, null
];
const GAME_BASS = [45, null, null, null, 41, null, null, null, 38, null, null, null, 40, null, null, null];

export class ChipAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.delay = null;
    this.noise = null;
    this.unlocked = false;
    this.muted = false;
    this.musicVolume = 0.45;
    this.sfxVolume = 0.7;
    this.theme = 'menu';
    this.tempoMultiplier = 1;
    this.timer = null;
    this.nextTime = 0;
    this.step = 0;
    this.playing = false;
    this._visHandler = () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else if (this.unlocked) this.ctx.resume().catch(() => {});
    };
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(ctx.destination);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicVolume * 0.6;
    this.musicGain.connect(this.master);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.delay = ctx.createDelay(0.6);
    this.delay.delayTime.value = 0.27;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.18;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1700;
    this.delay.connect(feedback);
    feedback.connect(this.delay);
    this.delay.connect(filter);
    filter.connect(this.musicGain);

    document.addEventListener('visibilitychange', this._visHandler);
    return ctx;
  }

  async unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* ignore */ }
    }
    if (!this.unlocked) {
      this.unlocked = true;
      this.startMusic();
    }
  }

  setVolumes(music, sfx, muted = this.muted) {
    this.musicVolume = Math.min(1, Math.max(0, music / 100));
    this.sfxVolume = Math.min(1, Math.max(0, sfx / 100));
    this.muted = Boolean(muted);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicGain.gain.setTargetAtTime(this.musicVolume * 0.6, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume, now, 0.02);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, now, 0.02);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, this.ctx.currentTime, 0.03);
  }

  tone({ freq, endFreq, type = 'square', duration = 0.08, volume = 0.08, when = 0, attack = 0.004, destination = this.sfxGain }) {
    const ctx = this.ctx;
    if (!ctx || this.muted || this.sfxVolume <= 0) return;
    const dest = destination || this.sfxGain;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + when;
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), start);
    if (endFreq) osc.frequency.linearRampToValueAtTime(Math.max(20, endFreq), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume, start + attack);
    gain.gain.linearRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  noiseBurst({ duration = 0.12, volume = 0.18, filter = 1200, when = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx || this.muted || this.sfxVolume <= 0) return;
    if (!this.noise) {
      const length = Math.floor(ctx.sampleRate * 0.35);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = filter;
    const gain = ctx.createGain();
    const start = ctx.currentTime + when;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(bp);
    bp.connect(gain);
    gain.connect(this.sfxGain);
    source.start(start);
    source.stop(start + duration + 0.02);
  }

  play(name) {
    if (!this.unlocked) return;
    const ctx = this.ensure();
    if (!ctx) return;
    switch (name) {
      case 'move':
        this.tone({ freq: 620, endFreq: 700, type: 'square', duration: 0.035, volume: 0.035 });
        break;
      case 'select':
        this.tone({ freq: 523, duration: 0.05, volume: 0.07 });
        this.tone({ freq: 784, duration: 0.09, volume: 0.07, when: 0.055 });
        break;
      case 'back':
        this.tone({ freq: 392, endFreq: 294, type: 'triangle', duration: 0.1, volume: 0.07 });
        break;
      case 'error':
        this.tone({ freq: 150, endFreq: 95, type: 'sawtooth', duration: 0.18, volume: 0.07 });
        break;
      case 'type':
        this.tone({ freq: 440 + Math.random() * 180, type: 'square', duration: 0.018, volume: 0.012 });
        break;
      case 'hit':
        this.noiseBurst({ duration: 0.16, volume: 0.2, filter: 900 });
        this.tone({ freq: 110, endFreq: 55, type: 'square', duration: 0.16, volume: 0.1 });
        break;
      case 'heal':
        [523, 659, 784, 1046].forEach((freq, i) => this.tone({ freq, type: 'sine', duration: 0.16, volume: 0.06, when: i * 0.07 }));
        break;
      case 'download':
        this.tone({ freq: 330, endFreq: 440, type: 'square', duration: 0.09, volume: 0.05 });
        break;
      case 'success':
        [523, 659, 784, 1046].forEach((freq, i) => this.tone({ freq, type: 'square', duration: 0.2, volume: 0.06, when: i * 0.1 }));
        break;
      case 'unlock':
        [440, 554, 659, 880, 1108].forEach((freq, i) => this.tone({ freq, type: 'triangle', duration: 0.32, volume: 0.08, when: i * 0.11 }));
        this.noiseBurst({ duration: 0.4, volume: 0.03, filter: 3000, when: 0.4 });
        break;
      case 'boot':
        this.tone({ freq: 110, endFreq: 440, type: 'triangle', duration: 0.6, volume: 0.05 });
        this.tone({ freq: 220, endFreq: 880, type: 'sine', duration: 0.5, volume: 0.04, when: 0.1 });
        break;
      case 'clear':
        [523, 659, 784, 1046, 1318].forEach((freq, i) => this.tone({ freq, type: 'square', duration: 0.32, volume: 0.07, when: i * 0.12 }));
        break;
      default:
        break;
    }
  }

  startMusic(theme = this.theme, tempoMultiplier = this.tempoMultiplier) {
    if (!this.ctx) return;
    this.theme = theme;
    this.tempoMultiplier = tempoMultiplier || 1;
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 90);
    this.schedule();
  }

  setTheme(theme, tempoMultiplier = 1) {
    if (theme === this.theme && Math.abs(tempoMultiplier - this.tempoMultiplier) < 0.01) {
      if (this.ctx && !this.playing) this.startMusic(theme, tempoMultiplier);
      return;
    }
    this.theme = theme;
    this.tempoMultiplier = tempoMultiplier || 1;
    this.step = 0;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.08;
  }

  stopMusic() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    if (!this.ctx || !this.playing) return;
    const lookahead = this.ctx.currentTime + 0.35;
    const bpm = this.theme === 'game' ? 104 * this.tempoMultiplier : 82 * this.tempoMultiplier;
    const stepDur = 60 / bpm / 2;
    while (this.nextTime < lookahead) {
      this.scheduleStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 32;
    }
  }

  scheduleStep(step, when, stepDur) {
    if (!this.ctx || this.musicVolume <= 0) return;
    const lead = this.theme === 'game' ? GAME_LEAD : MENU_LEAD;
    const bass = this.theme === 'game' ? GAME_BASS : MENU_BASS;
    const note = lead[step];
    if (note) {
      this.musicNote(NOTE(note), when, stepDur * 0.82, 'square', 0.032);
      if (this.theme === 'game' && step % 8 === 0) this.musicNote(NOTE(note + 12), when, stepDur * 0.5, 'triangle', 0.018);
    }
    const bassNote = bass[step];
    if (bassNote) this.musicNote(NOTE(bassNote), when, stepDur * 3.6, 'triangle', 0.05);
    if (step % 8 === 0) {
      const chord = this.theme === 'game' ? [57, 60, 64] : [50, 53, 57];
      chord.forEach((midi, i) => this.musicNote(NOTE(midi), when + i * 0.012, stepDur * 7.2, 'sine', 0.012));
    }
  }

  musicNote(freq, when, duration, type, volume) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.012);
    gain.gain.linearRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain);
    gain.connect(this.musicGain);
    gain.connect(this.delay);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }
}

export const audio = new ChipAudio();
