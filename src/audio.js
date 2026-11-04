/**
 * Synthesized automotive audio (Web Audio API). No external audio files.
 * Engine tone, tire noise, braking, impact and ambient wind are generated live.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.subOsc = null;
    this.subGain = null;
    this.screechNoise = null;
    this.screechFilter = null;
    this.screechGain = null;
    this.windNoise = null;
    this.windGain = null;
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

    // Engine tone: sawtooth + sub sine
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.setValueAtTime(80, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    this.subOsc = this.ctx.createOscillator();
    this.subOsc.type = 'sine';
    this.subOsc.frequency.value = 40;
    this.subGain = this.ctx.createGain();
    this.subGain.gain.value = 0.0;

    this.engineOsc.connect(this.engineGain);
    this.subOsc.connect(this.subGain);
    this.engineGain.connect(this.masterGain);
    this.subGain.connect(this.masterGain);

    this.engineOsc.start();
    this.subOsc.start();

    // Tire screech: bandpassed noise
    const size = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;

    this.screechNoise = this.ctx.createBufferSource();
    this.screechNoise.buffer = noiseBuffer;
    this.screechNoise.loop = true;

    this.screechFilter = this.ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.value = 3200;
    this.screechFilter.Q.value = 1.1;

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.value = 0.0;

    this.screechNoise.connect(this.screechFilter);
    this.screechFilter.connect(this.screechGain);
    this.screechGain.connect(this.masterGain);
    this.screechNoise.start();

    // Ambient wind: lowpassed noise
    const windBuffer = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const wd = windBuffer.getChannelData(0);
    for (let i = 0; i < size; i++) wd[i] = Math.random() * 2 - 1;

    this.windNoise = this.ctx.createBufferSource();
    this.windNoise.buffer = windBuffer;
    this.windNoise.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 600;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.0;

    this.windNoise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    this.windNoise.start();

    // Impact sound buffer (short noise burst + thud)
    this.impactBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const id = this.impactBuffer.getChannelData(0);
    for (let i = 0; i < id.length; i++) id[i] = (Math.random() * 2 - 1) * Math.exp(-i / 4000);

    this.started = true;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.masterGain) this.masterGain.gain.value = on ? 0.5 : 0.0;
  }

  /** Call every frame while playing. rpm is 0..1, slip is 0..1. */
  engine(rpm, slip, speedKmh) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const freq = 60 + rpm * 460;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.05);

    const vol = Math.min(0.32, 0.05 + rpm * 0.27);
    this.engineGain.gain.setTargetAtTime(vol, t, 0.08);
    this.subGain.gain.setTargetAtTime(vol * 0.55, t, 0.08);

    // Wind rises with speed
    const windTarget = Math.min(0.14, speedKmh / 300 * 0.14);
    this.windGain.gain.setTargetAtTime(windTarget, t, 0.2);

    // Screech under aggressive slip
    const screechTarget = slip > 0.25 && rpm > 0.15 ? Math.min(0.15, slip * 0.2) : 0;
    this.screechGain.gain.setTargetAtTime(screechTarget, t, 0.1);
  }

  brake() {
    if (!this.started || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.15);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  impact() {
    if (!this.started || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.impactBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 700;
    const g = this.ctx.createGain();
    g.gain.value = 0.14;
    src.connect(filt);
    filt.connect(g);
    g.connect(this.masterGain);
    src.start(t);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(50, t);
    osc.frequency.exponentialRampToValueAtTime(18, t + 0.3);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.2, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(og);
    og.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  indicator(on) {
    if (!this.started || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = on ? 880 : 440;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(on ? 0.04 : 0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }
}
