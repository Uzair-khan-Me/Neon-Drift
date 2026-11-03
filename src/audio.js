/**
 * Synthesized audio (Web Audio API). No external audio files.
 * Engine tone, tire screech, and crash noise are all generated in real time.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.screechNoise = null;
    this.screechFilter = null;
    this.screechGain = null;
    this.masterGain = null;
    this.enabled = true;
    this.started = false;
  }

  async start() {
    if (this.started) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    // Master
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(this.ctx.destination);

    // Engine: sawtooth oscillator whose pitch follows RPM / speed
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.setValueAtTime(110, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 55;
    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.0;

    this.engineOsc.connect(this.engineGain);
    sub.connect(subGain);
    this.engineGain.connect(this.masterGain);
    subGain.connect(this.masterGain);

    this.engineOsc.start();
    sub.start();
    this._subGain = subGain;

    // Tire screech: bandpassed white noise
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    this.screechNoise = this.ctx.createBufferSource();
    this.screechNoise.buffer = noiseBuffer;
    this.screechNoise.loop = true;

    this.screechFilter = this.ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.value = 3500;
    this.screechFilter.Q.value = 1.2;

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.value = 0.0;

    this.screechNoise.connect(this.screechFilter);
    this.screechFilter.connect(this.screechGain);
    this.screechGain.connect(this.masterGain);
    this.screechNoise.start();

    this.started = true;
  }

  setEnabled(on) {
    this.enabled = on;
    this.masterGain.gain.value = on ? 0.5 : 0.0;
  }

  /** Call every frame while playing. rpm is 0..1, slipping is 0..1 (tire slip). */
  engine(rpm, slipping) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    // Idle ~110 Hz, redline ~520 Hz, scaled by gear-ish rpm
    const freq = 110 + rpm * 410;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.06);

    // Volume: louder under load / higher rpm
    const targetVol = Math.min(0.35, 0.08 + rpm * 0.27);
    this.engineGain.gain.setTargetAtTime(targetVol, t, 0.08);
    this._subGain.gain.setTargetAtTime(targetVol * 0.5, t, 0.08);

    // Screech when handbrake / drifting at speed
    const screechTarget = slipping > 0.25 && rpm > 0.15 ? Math.min(0.18, slipping * 0.25) : 0;
    this.screechGain.gain.setTargetAtTime(screechTarget, t, 0.1);
  }

  crash() {
    if (!this.started || !this.enabled) return;
    const t = this.ctx.currentTime;
    // Noise burst
    const size = this.ctx.sampleRate * 0.6;
    const burst = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const d = burst.getChannelData(0);
    for (let i = 0; i < size; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = burst;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    src.connect(filt);
    filt.connect(g);
    g.connect(this.masterGain);
    src.start(t);

    // Low thud
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.25);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.18, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(og);
    og.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.35);
  }
}
