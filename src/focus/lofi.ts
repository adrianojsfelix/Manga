// Native lofi, made on the spot with Web Audio — nothing to download, all
// original to Manga: five styles of lofi (soft electric-piano chords, a lazy
// beat, vinyl crackle), and ambiences: rain, a storm with thunder, the city,
// a forest with birds, the sea, brown noise.

export type Style = "beats" | "chill" | "jazz" | "night" | "bossa";
export type Ambience = "rain" | "storm" | "city" | "forest" | "sea" | "brown";
export type Station = Style | Ambience;

export const STATIONS: { id: Station; name: string; kind: "lofi" | "ambience" }[] = [
  { id: "beats", name: "Lofi beats", kind: "lofi" },
  { id: "chill", name: "Chill", kind: "lofi" },
  { id: "jazz", name: "Café jazz", kind: "lofi" },
  { id: "night", name: "Night", kind: "lofi" },
  { id: "bossa", name: "Lofi bossa", kind: "lofi" },
  { id: "rain", name: "Rain", kind: "ambience" },
  { id: "storm", name: "Rain and thunder", kind: "ambience" },
  { id: "city", name: "City", kind: "ambience" },
  { id: "forest", name: "Forest and birds", kind: "ambience" },
  { id: "sea", name: "Sea", kind: "ambience" },
  { id: "brown", name: "Brown noise", kind: "ambience" },
];

interface StyleDef {
  bpm: number;
  /** Chords (Hz), each lasting `bars` bars. */
  chords: number[][];
  bars: number;
  /** Per eighth of a bar (8): k kick, s snare, r rim, "" nothing. */
  drums: string[];
  hats: boolean;
  swing: number;
  cutoff: number;
  crackle: number;
  /** A bass note (the chord's root) on each beat. */
  bass: boolean;
  /** Slow, swelling chords instead of a strum. */
  pad: boolean;
}

const STYLES: Record<Style, StyleDef> = {
  // Dm9, G13, Cmaj9, Am9.
  beats: {
    bpm: 72, bars: 2, swing: 0.12, cutoff: 1400, crackle: 0.035, bass: false, pad: false, hats: true,
    chords: [[146.8, 220, 261.6, 329.6, 349.2], [98, 246.9, 349.2, 392, 659.3], [130.8, 246.9, 293.7, 329.6, 392], [110, 261.6, 329.6, 392, 493.9]],
    drums: ["k", "", "", "", "s", "k", "", ""],
  },
  // Fmaj7, Em7, Dm7, Cmaj7: slower, softer, rimshots.
  chill: {
    bpm: 64, bars: 2, swing: 0.08, cutoff: 1100, crackle: 0.05, bass: false, pad: false, hats: false,
    chords: [[87.3, 220, 261.6, 329.6], [82.4, 196, 246.9, 293.7], [73.4, 174.6, 220, 261.6], [65.4, 164.8, 196, 246.9]],
    drums: ["k", "", "", "", "r", "", "", ""],
  },
  // Cm9, F13, Bbmaj9, Gm7 with a walking bass and brushes.
  jazz: {
    bpm: 84, bars: 1, swing: 0.18, cutoff: 1800, crackle: 0.03, bass: true, pad: false, hats: true,
    chords: [[130.8, 233.1, 311.1, 293.7], [87.3, 220, 311.1, 392], [116.5, 220, 293.7, 349.2], [98, 233.1, 293.7, 349.2]],
    drums: ["k", "", "r", "", "s", "", "r", ""],
  },
  // Long pads, no drums: for late hours.
  night: {
    bpm: 52, bars: 2, swing: 0, cutoff: 900, crackle: 0.045, bass: false, pad: true, hats: false,
    chords: [[110, 220, 261.6, 329.6, 392], [87.3, 220, 261.6, 349.2], [98, 246.9, 293.7, 392], [82.4, 196, 246.9, 329.6]],
    drums: ["", "", "", "", "", "", "", ""],
  },
  // Am7, D9, Gmaj7, Cmaj7 on a bossa beat.
  bossa: {
    bpm: 92, bars: 1, swing: 0.04, cutoff: 1600, crackle: 0.03, bass: true, pad: false, hats: false,
    chords: [[110, 196, 261.6, 329.6], [73.4, 185, 261.6, 329.6], [98, 185, 246.9, 293.7], [65.4, 164.8, 246.9, 329.6]],
    drums: ["k", "", "r", "k", "", "r", "k", "r"],
  },
};

export function isStation(v: unknown): v is Station {
  return typeof v === "string" && STATIONS.some((s) => s.id === v);
}

export class Lofi {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private timers: number[] = [];
  private nextBeat = 0;
  private beat = 0;
  private style: StyleDef | null = null;
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
    const every = (ms: () => number, f: () => void) => {
      const run = () => {
        if (this.station !== station) return;
        f();
        this.timers.push(window.setTimeout(run, ms()));
      };
      this.timers.push(window.setTimeout(run, ms()));
    };
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    if (station in STYLES) {
      this.style = STYLES[station as Style];
      this.noise("crackle", this.style.crackle);
      this.nextBeat = ctx.currentTime + 0.1;
      this.beat = 0;
      this.timers.push(window.setInterval(() => this.schedule(), 100));
      return;
    }
    this.style = null;
    switch (station) {
      case "rain":
        this.noise("rain", 0.55);
        this.noise("drops", 0.12);
        break;
      case "storm":
        this.noise("rain", 0.7);
        this.noise("drops", 0.16);
        every(() => rand(7000, 18000), () => this.thunder());
        break;
      case "city":
        this.noise("brown", 0.45, 450);
        every(() => rand(2500, 6000), () => this.car());
        every(() => rand(12000, 30000), () => this.horn());
        break;
      case "forest":
        this.noise("wind", 0.35);
        every(() => rand(900, 3500), () => this.bird());
        break;
      case "sea":
        this.noise("sea", 0.6);
        break;
      default:
        this.noise("brown", 0.8);
    }
  }

  stop() {
    for (const t of this.timers) {
      window.clearTimeout(t);
      window.clearInterval(t);
    }
    this.timers = [];
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

  /** A looping noise: brown, rain, drops, crackle, wind (it breathes) or the sea (waves). */
  private noise(kind: "brown" | "rain" | "drops" | "crackle" | "wind" | "sea", gain: number, lowpass?: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * (kind === "sea" || kind === "wind" ? 12 : 4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "drops") d[i] = Math.random() < 0.0004 ? w : d[i - 1] * 0.96 || 0;
      else if (kind === "crackle") d[i] = Math.random() < 0.0006 ? w * 0.9 : w * 0.01;
      else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
        // Waves: the noise swells and ebbs; wind: it breathes.
        if (kind === "sea") d[i] *= 0.25 + 0.75 * Math.pow(Math.sin((Math.PI * i) / (ctx.sampleRate * 6)), 2);
        if (kind === "wind") d[i] *= 0.5 + 0.5 * Math.sin((2 * Math.PI * i) / (ctx.sampleRate * 12));
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = gain;
    let tail: AudioNode = src;
    const filter = (type: BiquadFilterType, f: number) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      tail.connect(b);
      tail = b;
      this.nodes.push(b);
    };
    if (kind === "rain") filter("highpass", 400);
    if (kind === "wind") filter("lowpass", 900);
    if (lowpass) filter("lowpass", lowpass);
    tail.connect(g).connect(this.master!);
    src.start();
    this.nodes.push(src, g);
  }

  private burst(at: number, dur: number, gain: number, type: BiquadFilterType, freq: number, sweepTo?: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(at);
  }

  private tone(at: number, f: number, dur: number, gain: number, type: OscillatorType = "sine", to?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  // ——— the ambiences' events ———

  private thunder() {
    const at = this.ctx!.currentTime;
    this.burst(at, 0.25, 0.5, "lowpass", 900);
    this.burst(at + 0.08, 4.5, 0.9, "lowpass", 160, 60);
  }

  private car() {
    const at = this.ctx!.currentTime;
    this.burst(at, 2.8, 0.18, "bandpass", 300 + Math.random() * 300, 120);
  }

  private horn() {
    const at = this.ctx!.currentTime;
    const f = 330 + Math.random() * 120;
    this.tone(at, f, 0.25, 0.03, "square");
    this.tone(at + 0.32, f, 0.4, 0.03, "square");
  }

  private bird() {
    const ctx = this.ctx!;
    const at = ctx.currentTime;
    const base = 2200 + Math.random() * 2400;
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      const t0 = at + i * (0.09 + Math.random() * 0.08);
      this.tone(t0, base * (0.9 + Math.random() * 0.3), 0.07 + Math.random() * 0.05, 0.05, "sine", base * (1.1 + Math.random() * 0.4));
    }
  }

  // ——— the lofi ———

  private schedule() {
    const ctx = this.ctx;
    const st = this.style;
    if (!ctx || !this.master || !st) return;
    const step = 60 / st.bpm / 2; // eighth notes
    const perChord = 8 * st.bars;
    while (this.nextBeat < ctx.currentTime + 0.4) {
      const swing = this.beat % 2 ? step * st.swing : 0;
      const at = this.nextBeat + swing;
      const chord = st.chords[Math.floor(this.beat / perChord) % st.chords.length];
      if (this.beat % perChord === 0) this.chord(chord, at, step * (perChord - 1), st);
      const inBar = this.beat % 8;
      const hit = st.drums[inBar];
      if (hit === "k") this.kick(at);
      if (hit === "s") this.burst(at, st.bpm > 80 ? 0.3 : 0.22, st.bpm > 80 ? 0.16 : 0.28, st.bpm > 80 ? "lowpass" : "bandpass", st.bpm > 80 ? 3000 : 1800);
      if (hit === "r") this.burst(at, 0.05, 0.12, "bandpass", 2500);
      if (st.hats) this.burst(at, 0.05, inBar % 2 ? 0.04 : 0.07, "highpass", 7000);
      if (st.bass && inBar % 2 === 0) {
        // The root, then a walk up its fifth and octave.
        const root = chord[0] < 100 ? chord[0] : chord[0] / 2;
        const walk = [1, 1.5, 2, 1.5][(inBar / 2) % 4];
        this.tone(at, root * walk, step * 1.7, 0.22, "sine");
      }
      this.nextBeat += step;
      this.beat++;
    }
  }

  private chord(freqs: number[], at: number, dur: number, st: StyleDef) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = st.cutoff;
    lp.connect(this.master!);
    freqs.forEach((f, k) => {
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = k === 0 ? "sine" : "triangle";
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        const start = at + (st.pad ? 0 : k * 0.025); // a lazy strum, or a swell
        const peak = k === 0 ? 0.16 : st.pad ? 0.045 : 0.06;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(peak, start + (st.pad ? dur * 0.35 : 0.03));
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
}
