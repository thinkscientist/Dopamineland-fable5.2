// Generative soundtrack + reactive signals for Dopamine Land.
// Everything is synthesised with WebAudio — no samples, no downloads.

const BPM = 104;
const SPB = 60 / BPM; // seconds per beat

// Feel-good loop: IV – V – iii – vi – IV – V – I – I  (C major)
const CHORDS = [
  { root: 41, notes: [65, 69, 72, 76] }, // Fmaj7
  { root: 43, notes: [67, 71, 74, 76] }, // G6
  { root: 40, notes: [64, 67, 71, 74] }, // Em7
  { root: 45, notes: [64, 69, 72, 76] }, // Am
  { root: 41, notes: [65, 69, 72, 79] }, // Fmaj9
  { root: 43, notes: [67, 71, 74, 79] }, // G
  { root: 36, notes: [64, 67, 72, 76] }, // C
  { root: 36, notes: [64, 67, 74, 79] }, // Cadd9
];
const PENTA = [0, 2, 4, 7, 9]; // C major pentatonic
const ARP = [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 3, 1, 5, 3, 4, 2];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Soundtrack {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.muted = false;
    this.boost = 0;
    this.levels = { bass: 0, mid: 0, high: 0 };
    this._fallbackT0 = performance.now() / 1000;
    this._nextStep = 0; // in 16th notes
    this._freq = null;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.started = true;

    // master chain
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.72;
    this._freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.master.connect(comp).connect(this.analyser).connect(ctx.destination);
    this.master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 2.5);

    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.4);
    const revGain = ctx.createGain();
    revGain.gain.value = 0.5;
    this.reverb.connect(revGain).connect(this.master);

    // ping-pong-ish delay
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = SPB * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 3200;
    this.delay.connect(dlp).connect(fb).connect(this.delay);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.34;
    dlp.connect(delayOut).connect(this.master);
    dlp.connect(this.reverb);

    // pad bus: filter + sidechain pump
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.8;
    this.duck = ctx.createGain();
    this.padFilter.connect(this.duck);
    this.duck.connect(this.master);
    this.duck.connect(this.reverb);

    this.noise = this._noiseBuffer(1.5);

    this.t0 = ctx.currentTime + 0.12;
    this._nextStep = 0;
    this._timer = setInterval(() => this._schedule(), 30);
    this._schedule();
  }

  // ── clock ────────────────────────────────────────────────────────────
  /** Position in beats (float). Uses a silent fallback clock before audio starts. */
  get beats() {
    if (this.started) return Math.max(0, (this.ctx.currentTime - this.t0) / SPB);
    return (performance.now() / 1000 - this._fallbackT0) / SPB;
  }
  /** 1 → 0 pulse on every beat. */
  get kick() {
    const f = this.beats % 1;
    return Math.exp(-f * 5.5);
  }
  get bar() {
    return Math.floor(this.beats / 4);
  }

  update(dt, boost) {
    this.boost = boost;
    const L = this.levels;
    if (this.started && !this.muted) {
      this.analyser.getByteFrequencyData(this._freq);
      const avg = (a, b) => {
        let s = 0;
        for (let i = a; i < b; i++) s += this._freq[i];
        return s / ((b - a) * 255);
      };
      L.bass = avg(1, 6);
      L.mid = avg(8, 40);
      L.high = avg(48, 110);
      this.padFilter.frequency.setTargetAtTime(900 + boost * 5200, this.ctx.currentTime, 0.12);
    } else {
      const k = this.kick;
      L.bass += (k * 0.8 - L.bass) * Math.min(1, dt * 14);
      L.mid = 0.3 + 0.2 * Math.sin(this.beats * Math.PI);
      L.high = 0.25 + 0.2 * Math.sin(this.beats * Math.PI * 4);
    }
  }

  setMuted(m) {
    this.muted = m;
    if (!this.started) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(m ? 0 : 0.85, t, 0.08);
  }

  // ── scheduler ────────────────────────────────────────────────────────
  _schedule() {
    const ctx = this.ctx;
    if (ctx.state === 'suspended') return;
    const horizon = ctx.currentTime + 0.18;
    const s16 = SPB / 4;
    while (this.t0 + this._nextStep * s16 < horizon) {
      const step = this._nextStep++;
      const t = this.t0 + step * s16;
      if (t < ctx.currentTime - 0.05) continue; // tab was asleep; skip the backlog
      this._step(step, t);
    }
  }

  _step(step, t) {
    const s = step % 16; // position in bar
    const bar = Math.floor(step / 16);
    const chord = CHORDS[bar % CHORDS.length];
    const full = bar >= 2; // drums join after a 2 bar intro
    const fillBar = bar % 8 === 7;

    if (s === 0) this._pad(chord, t);

    // arpeggio — bright plucks through the delay
    const skip = !full && s % 2 === 1;
    if (!skip) {
      const idx = ARP[(s + (bar % 2) * 5) % 16];
      const n = chord.notes[idx % 4] + 12 * Math.floor(idx / 4) + 12;
      this._pluck(mtof(n), t, s % 4 === 0 ? 0.11 : 0.065, 0.22, 0.7);
    }

    if (full) {
      if (s % 4 === 0) this._kick(t);
      if (s === 4 || s === 12) this._clap(t);
      if (s % 2 === 0) this._hat(t, s % 4 === 2 ? 0.075 : 0.03, s % 4 === 2 ? 0.07 : 0.03);
      if (fillBar && s >= 12) this._hat(t, 0.06, 0.03);
      // bass: syncopated octave bounce
      if (s === 0 || s === 6 || s === 10) this._bass(mtof(chord.root), t, 0.3);
      if (s === 3 || s === 14) this._bass(mtof(chord.root + 12), t, 0.14);
    }
  }

  // ── voices ───────────────────────────────────────────────────────────
  _pad(chord, t) {
    const ctx = this.ctx;
    const dur = SPB * 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.5);
    g.gain.setValueAtTime(0.05, t + dur - 0.2);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.7);
    g.connect(this.padFilter);
    for (const n of chord.notes) {
      for (const det of [-9, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n - 12);
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 0.8);
      }
    }
  }

  _pluck(freq, t, vol, decay, send) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.003;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.master);
    const s = ctx.createGain();
    s.gain.value = send;
    g.connect(s).connect(this.delay);
    o.start(t);
    o2.start(t);
    o.stop(t + decay + 0.05);
    o2.stop(t + decay + 0.05);
  }

  _kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.8, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.35);
    // sidechain pump on the pad
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(0.35, t);
    this.duck.gain.linearRampToValueAtTime(1, t + SPB * 0.8);
  }

  _noiseHit(t, type, freq, q, vol, decay, dest) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
    src.connect(f).connect(g).connect(dest || this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
    return g;
  }

  _hat(t, vol, decay) {
    this._noiseHit(t, 'highpass', 7500, 0.7, vol, decay);
  }

  _clap(t) {
    const g = this._noiseHit(t, 'bandpass', 1700, 0.9, 0.2, 0.2);
    g.connect(this.reverb);
  }

  _bass(freq, t, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900 + this.boost * 1500, t);
    f.frequency.exponentialRampToValueAtTime(160, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(f);
    sub.connect(f);
    f.connect(g).connect(this.master);
    o.start(t);
    sub.start(t);
    o.stop(t + 0.36);
    sub.stop(t + 0.36);
  }

  // ── one-shots triggered by the player ────────────────────────────────
  /** Sparkly bell. Pitch climbs the pentatonic scale with the combo. */
  sparkle(combo = 1) {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const i = (combo - 1) % 15;
    const base = 72 + PENTA[i % 5] + 12 * Math.floor(i / 5);
    [0, 7, 12].forEach((iv, k) => {
      this._pluck(mtof(base + iv), t + k * 0.045, 0.16 - k * 0.035, 0.5, 0.9);
    });
    // soft thump for weight
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.2);
  }

  /** Whoosh used for world transitions. */
  whoosh(up = true) {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(up ? 220 : 5000, t);
    f.frequency.exponentialRampToValueAtTime(up ? 5200 : 240, t + 0.75);
    f.frequency.exponentialRampToValueAtTime(300, t + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 1.5);
    src.connect(f).connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
    src.start(t);
    src.stop(t + 1.6);
  }

  /** Big rising major chord for euphoria. */
  fanfare() {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime + 0.01;
    [60, 64, 67, 72, 76, 79, 84, 88, 91, 96].forEach((n, k) => {
      this._pluck(mtof(n), t + k * 0.055, 0.15, 0.9, 1);
    });
    this.whoosh(true);
  }

  // ── helpers ──────────────────────────────────────────────────────────
  _noiseBuffer(sec) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _impulse(sec, decay) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }
}
