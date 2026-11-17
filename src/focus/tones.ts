// The alarm tones, made on the spot with Web Audio (no sound files): each a
// few notes with its own voice. Original to Manga.

export interface ToneDef {
  id: string;
  /** English key for t(). */
  name: string;
  notes: { f: number; at: number; dur: number; type: OscillatorType; gain: number; slide?: number }[];
  /** Seconds the tone lasts. */
  length: number;
}

const n = (f: number, at: number, dur: number, type: OscillatorType = "sine", gain = 0.5, slide?: number) => ({ f, at, dur, type, gain, slide });

export const TONES: ToneDef[] = [
  { id: "bell", name: "Soft bell", length: 2.6, notes: [n(1318.5, 0, 2.4, "sine", 0.45), n(2637, 0, 1.2, "sine", 0.12), n(987.8, 0.5, 2, "sine", 0.3)] },
  { id: "kalimba", name: "Kalimba", length: 1.6, notes: [523.3, 659.3, 784, 1046.5, 784].map((f, i) => n(f, i * 0.16, 0.7, "triangle", 0.4)) },
  { id: "digital", name: "Digital", length: 1.4, notes: [0, 0.18, 0.36, 0.8, 0.98, 1.16].map((at) => n(988, at, 0.12, "square", 0.16)) },
  { id: "drops", name: "Drops", length: 1.5, notes: [0, 0.32, 0.5, 0.9].map((at, i) => n(1400 - i * 120, at, 0.22, "sine", 0.4, 0.5)) },
  { id: "chimes", name: "Wind chimes", length: 2.8, notes: [2093, 1568, 2637, 1760, 2349, 1976].map((f, i) => n(f, i * 0.28 + (i % 2) * 0.07, 1.4, "sine", 0.18)) },
  { id: "kumo", name: "Manga's chirp", length: 1.2, notes: [n(880, 0, 0.14, "sine", 0.35, 1.5), n(1175, 0.18, 0.14, "sine", 0.35, 1.5), n(1568, 0.42, 0.3, "triangle", 0.3, 1.2)] },
];

export function tone(id: string): ToneDef {
  return TONES.find((x) => x.id === id) ?? TONES[0];
}

/** Plays a tone now; answers its length in seconds. */
export function playTone(ctx: AudioContext, id: string, volume: number): number {
  const def = tone(id);
  const out = ctx.createGain();
  out.gain.value = Math.min(1, Math.max(0, volume));
  out.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.02;
  for (const note of def.notes) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = note.type;
    o.frequency.setValueAtTime(note.f, t0 + note.at);
    if (note.slide) o.frequency.exponentialRampToValueAtTime(note.f * note.slide, t0 + note.at + note.dur);
    g.gain.setValueAtTime(0.0001, t0 + note.at);
    g.gain.exponentialRampToValueAtTime(note.gain, t0 + note.at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + note.at + note.dur);
    o.connect(g).connect(out);
    o.start(t0 + note.at);
    o.stop(t0 + note.at + note.dur + 0.05);
  }
  return def.length;
}
