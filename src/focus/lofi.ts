// Native lofi, made on the spot with Web Audio: soft electric-piano chords,
// a lazy beat and vinyl crackle; or rain; or brown noise. Nothing to
// download, original to Manga.

export type Station = "beats" | "rain" | "brown";

export const STATIONS: { id: Station; name: string }[] = [
  { id: "beats", name: "Lofi beats" },
  { id: "rain", name: "Rain" },
  { id: "brown", name: "Brown noise" },
];

// Dm9, G13, Cmaj9, Am9 (Hz), two bars each.
const CHORDS = [
  [146.8, 220, 261.6, 329.6, 349.2],
  [98, 246.9, 349.2, 392, 659.3],
  [130.8, 246.9, 293.7, 329.6, 392],
  [110, 261.6, 329.6, 392, 493.9],
];
const BPM = 72;

export class Lofi {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private timer: number | null = null;
  private nextBeat = 0;
  private beat = 0;
  station: Station | null = null;
  private vol = 0.6;

  get playing() {
    return this.station != null;
  }

  volume(v: number) {
    this.vol = Math.min(1, Math.max(0, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.vol * 0.5, this.ctx.currentTime, 0.1);
  }

  play(station: Station) {
    this.stop();
    this.ctx ??= new AudioContext();
    void this.ctx.resume();
    const ctx = this.ctx;
    this.station = station;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(this.vol * 0.5, ctx.currentTime, 0.4);
    this.master.connect(ctx.destination);
    if (station === "beats") {
      this.noise("crackle", 0.035);
      this.nextBeat = ctx.currentTime + 0.1;
      this.beat = 0;
      this.timer = window.setInterval(() => this.schedule(), 100);
    } else if (station === "rain") {
      this.noise("rain", 0.55);
      this.noise("drops", 0.12);
    } else {
      this.noise("brown", 0.8);
    }
  }

  stop() {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    const ctx = this.ctx;
    const master = this.master;
    if (ctx && master) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      const old = this.nodes;
      window.setTimeout(() => {
        for (const n of old) n.disconnect();
        master.disconnect();
      }, 700);
    }
    this.nodes = [];
    this.master = null;
    this.station = null;
  }

  /** A looping noise: brown, rain (filtered), drops, or vinyl crackle. */
  private noise(kind: "brown" | "rain" | "drops" | "crackle", gain: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown" || kind === "rain") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else if (kind === "drops") {
        d[i] = Math.random() < 0.0004 ? w : d[i - 1] * 0.96 || 0;
      } else {
        d[i] = Math.random() < 0.0006 ? w * 0.9 : w * 0.01;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = gain;
    let tail: AudioNode = src;
    if (kind === "rain") {
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 400;
      src.connect(f);
      tail = f;
    }
    tail.connect(g).connect(this.master!);
    src.start();
    this.nodes.push(src, g, tail);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const step = 60 / BPM / 2; // eighth notes
    while (this.nextBeat < ctx.currentTime + 0.4) {
      const i = this.beat % 32; // two bars of 16 eighths... 4 chords over 32 steps × 2
      const swing = this.beat % 2 ? step * 0.12 : 0;
      const at = this.nextBeat + swing;
      if (i % 16 === 0) this.chord(CHORDS[Math.floor(this.beat / 32) % CHORDS.length], at, step * 15);
      const inBar = i % 8;
      if (inBar === 0 || (inBar === 5 && this.beat % 16 > 8)) this.kick(at);
      if (inBar === 4) this.snare(at);
      this.hat(at, inBar % 2 ? 0.05 : 0.08);
      this.nextBeat += step;
      this.beat++;
    }
  }

  private chord(freqs: number[], at: number, dur: number) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    lp.connect(this.master!);
    freqs.forEach((f, k) => {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = k === 0 ? "sine" : "triangle";
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        const start = at + k * 0.025; // a lazy strum
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(k === 0 ? 0.16 : 0.06, start + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        o.connect(g).connect(lp);
        o.start(start);
        o.stop(start + dur + 0.1);
      }
    });
  }

  private kick(at: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.18);
    g.gain.setValueAtTime(0.7, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + 0.4);
  }

  private burst(at: number, dur: number, gain: number, type: BiquadFilterType, freq: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(at);
  }

  private snare(at: number) {
    this.burst(at, 0.22, 0.28, "bandpass", 1800);
  }

  private hat(at: number, gain: number) {
    this.burst(at, 0.05, gain, "highpass", 7000);
  }
}
