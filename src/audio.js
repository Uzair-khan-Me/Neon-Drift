/**
 * Synthesized automotive audio (Web Audio API). No external audio files.
 * Engine, tire-road, screech, brake, impact, wind, indicator.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.engineOsc = null; this.engineGain = null;
    this.subOsc = null; this.subGain = null;
    this.tireNoise = null; this.tireFilter = null; this.tireGain = null;
    this.screechNoise = null; this.screechFilter = null; this.screechGain = null;
    this.windNoise = null; this.windFilter = null; this.windGain = null;
    this.impactBuffer = null;
    this.enabled = true;
    this.started = false;
  }

  async start() {
    if (this.started) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(this.ctx.destination);

    // ---- Engine: sawtooth + sub sine ----
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.setValueAtTime(55, this.ctx.currentTime);
    this.engineGain = this.ctx.createGain(); this.engineGain.gain.value = 0.0;
    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = 27.5;
    this.subGain = this.ctx.createGain(); this.subGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineGain);
    this.subOsc.connect(this.subGain);
    this.engineGain.connect(this.masterGain);
    this.subGain.connect(this.masterGain);
    this.engineOsc.start(); this.subOsc.start();

    // ---- Tire-road roar: lowpassed noise, scales with speed ----
    const size = this.ctx.sampleRate * 2;
    const tireBuf = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const td = tireBuf.getChannelData(0);
    for (let i = 0; i < size; i++) td[i] = Math.random() * 2 - 1;
    this.tireNoise = this.ctx.createBufferSource();
    this.tireNoise.buffer = tireBuf; this.tireNoise.loop = true;
    this.tireFilter = this.ctx.createBiquadFilter();
    this.tireFilter.type = 'lowpass'; this.tireFilter.frequency.value = 900; this.tireFilter.Q = 1;
    this.tireGain = this.ctx.createGain(); this.tireGain.gain.value = 0.0;
    this.tireNoise.connect(this.tireFilter); this.tireFilter.connect(this.tireGain); this.tireGain.connect(this.masterGain);
    this.tireNoise.start();

    // ---- Screech: bandpassed noise ----
    const screechBuf = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const sd = screechBuf.getChannelData(0);
    for (let i = 0; i < size; i++) sd[i] = Math.random() * 2 - 1;
    this.screechNoise = this.ctx.createBufferSource();
    this.screechNoise.buffer = screechBuf; this.screechNoise.loop = true;
    this.screechFilter = this.ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass'; this.screechFilter.frequency.value = 3400; this.screechFilter.Q = 1.2;
    this.screechGain = this.ctx.createGain(); this.screechGain.gain.value = 0.0;
    this.screechNoise.connect(this.screechFilter); this.screechFilter.connect(this.screechGain); this.screechGain.connect(this.masterGain);
    this.screechNoise.start();

    // ---- Wind ----
    const windBuf = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const wd = windBuf.getChannelData(0);
    for (let i = 0; i < size; i++) wd[i] = Math.random() * 2 - 1;
    this.windNoise = this.ctx.createBufferSource();
    this.windNoise.buffer = windBuf; this.windNoise.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass'; this.windFilter.frequency.value = 700;
    this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0.0;
    this.windNoise.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.masterGain);
    this.windNoise.start();

    // ---- Impact buffer ----
    this.impactBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const id = this.impactBuffer.getChannelData(0);
    for (let i = 0; i < id.length; i++) id[i] = (Math.random() * 2 - 1) * Math.exp(-i / 4000);

    this.started = true;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.masterGain) this.masterGain.gain.value = on ? 0.5 : 0.0;
  }

  /** Called every frame while playing. rpm 0..1, slip 0..1, speedKmh. */
  engine(rpm, slip, speedKmh) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const freq = 50 + rpm * 500;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.05);
    const vol = Math.min(0.3, 0.04 + rpm * 0.26);
    this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
    this.subGain.gain.setTargetAtTime(vol * 0.5, t, 0.08);

    // Tire roar rises with speed
    const tireTarget = Math.min(0.10, speedKmh / 260 * 0.10);
    this.tireGain.gain.setTargetAtTime(tireTarget, t, 0.15);
    this.tireFilter.frequency.setTargetAtTime(700 + speedKmh * 1.2, t, 0.15);

    // Wind rises with speed
    const windTarget = Math.min(0.12, speedKmh / 260 * 0.12);
    this.windGain.gain.setTargetAtTime(windTarget, t, 0.2);

    // Screech under aggressive slip
    const screechTarget = slip > 0.25 && rpm > 0.15 ? Math.min(0.14, slip * 0.18) : 0;
    this.screechGain.gain.setTargetAtTime(screechTarget, t, 0.1);
  }

  brake() {
    if (!this.started || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(450, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.25);
  }

  impact() {
    if (!this.started || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.impactBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 750;
    const g = this.ctx.createGain(); g.gain.value = 0.16;
    src.connect(filt); filt.connect(g); g.connect(this.masterGain);
    src.start(t);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 0.35);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.22, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(og); og.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.45);
  }

  indicator(on) {
    if (!this.started || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square'; osc.frequency.value = on ? 900 : 450;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(on ? 0.05 : 0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(t); osc.stop(t + 0.18);
  }
}
