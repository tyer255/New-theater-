const CHORD_PROGRESSION = [
  { bass: 45, notes: [57, 60, 64, 71] },
  { bass: 41, notes: [53, 57, 60, 64] },
  { bass: 48, notes: [55, 60, 64, 67] },
  { bass: 43, notes: [55, 59, 62, 69] },
];

const CHORD_DURATION = 5.2;
const midiToFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class TheatreAudio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  filter!: BiquadFilterNode;
  music!: GainNode;
  sfx!: GainNode;
  noise!: AudioBuffer;
  timer: number | null = null;
  nextTime = 0;
  index = 0;
  muted = false;
  immersion = -1;
  ducked = false;
  musicBase = 0.55;

  get isMusicDucked() {
    return this.ducked;
  }

  get started() {
    return this.ctx !== null;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume().catch(() => {});
      return;
    }
    const AudioCtx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      this.master.connect(comp);
      comp.connect(ctx.destination);

      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 2200;
      this.filter.Q.value = 0.4;
      this.filter.connect(this.master);

      this.music = ctx.createGain();
      this.music.gain.value = 0.55;
      this.music.connect(this.filter);

      const convolver = ctx.createConvolver();
      convolver.buffer = this.makeImpulse(3.4);
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      this.music.connect(convolver);
      convolver.connect(wet);
      wet.connect(this.filter);

      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.6;
      this.sfx.connect(this.master);

      const noiseLen = Math.floor(ctx.sampleRate * 0.4);
      this.noise = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.85, ctx.currentTime, 0.8);
      this.nextTime = ctx.currentTime + 0.15;
      this.schedule();
      this.timer = window.setInterval(() => this.schedule(), 300);
    } catch {
      // Ignore audio initialization failures in restricted environments
    }
  }

  makeImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
    }
    return buf;
  }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime) {
      this.nextTime = ctx.currentTime + 0.05;
    }
    while (this.nextTime < ctx.currentTime + 1.5) {
      this.playChord(this.nextTime, CHORD_PROGRESSION[this.index % CHORD_PROGRESSION.length]);
      this.nextTime += CHORD_DURATION;
      this.index++;
    }
  }

  playChord(startTime: number, chord: { bass: number; notes: number[] }) {
    const ctx = this.ctx!;
    const endTime = startTime + CHORD_DURATION + 2;

    for (const note of chord.notes) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToFreq(note);
        osc.detune.value = detune;

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(420, startTime);
        lp.frequency.linearRampToValueAtTime(1300, startTime + 2.2);
        lp.frequency.linearRampToValueAtTime(600, endTime);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0, startTime);
        g.gain.linearRampToValueAtTime(0.028, startTime + 1.8);
        g.gain.setValueAtTime(0.028, startTime + CHORD_DURATION - 0.2);
        g.gain.linearRampToValueAtTime(0, endTime);

        osc.connect(lp);
        lp.connect(g);
        g.connect(this.music);
        osc.start(startTime);
        osc.stop(endTime + 0.05);
      }
    }

    const bassOsc = ctx.createOscillator();
    bassOsc.type = 'sine';
    bassOsc.frequency.value = midiToFreq(chord.bass);
    const bassGain = ctx.createGain();
    bassGain.gain.setValueAtTime(0, startTime);
    bassGain.gain.linearRampToValueAtTime(0.16, startTime + 1.2);
    bassGain.gain.linearRampToValueAtTime(0, endTime);
    bassOsc.connect(bassGain);
    bassGain.connect(this.music);
    bassOsc.start(startTime);
    bassOsc.stop(endTime + 0.05);

    for (let i = 0; i < 6; i++) {
      const arpTime = startTime + 0.5 + i * 0.78;
      const arpNote = chord.notes[(i * 3) % chord.notes.length] + 24;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midiToFreq(arpNote);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, arpTime);
      g.gain.linearRampToValueAtTime(0.022, arpTime + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0005, arpTime + 1.4);
      osc.connect(g);
      g.connect(this.music);
      osc.start(arpTime);
      osc.stop(arpTime + 1.5);
    }
  }

  setImmersion(sitBlend: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const quant = Math.round(sitBlend * 20) / 20;
    if (quant !== this.immersion) {
      this.immersion = quant;
      this.filter.frequency.setTargetAtTime(1900 + quant * 9000, ctx.currentTime, 0.3);
      this.musicBase = 0.5 + quant * 0.35;
      this.applyMusic();
    }
  }

  setMusicDucked(ducked: boolean) {
    if (ducked !== this.ducked) {
      this.ducked = ducked;
      this.applyMusic();
    }
  }

  applyMusic() {
    const ctx = this.ctx;
    if (ctx) {
      this.music.gain.setTargetAtTime(this.ducked ? 0 : this.musicBase, ctx.currentTime, 0.4);
    }
  }

  footstep() {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 220 + Math.random() * 120;
    bp.Q.value = 1.2;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.32, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.12);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfx);
    src.start(now, Math.random() * 0.2, 0.15);
  }

  thump() {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime + 0.25;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.18);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.4, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.25);

    osc.connect(g);
    g.connect(this.sfx);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const ctx = this.ctx;
    if (ctx) {
      if (!muted) ctx.resume().catch(() => {});
      this.master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.25);
    }
  }

  dispose() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
