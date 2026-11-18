// What plays, as the island shows it. Pure: tested on its own.

export interface Media {
  app: string;
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  /** Seconds, when it was read. */
  position: number;
  /** Seconds; 0 when the app does not say. */
  duration: number;
  /** A data: URL, or empty. */
  cover: string;
  canSeek: boolean;
  canSkip: boolean;
  /** "none" | "track" | "list" (older builds: missing). */
  repeat?: "none" | "track" | "list";
  canRepeat?: boolean;
}

/** The app's volume line among the sound's apps: by name, one way or the other. */
export function appOf<T extends { name: string }>(apps: readonly T[], app: string): T | null {
  const a = app.toLowerCase().replace(/\s+/g, "");
  if (!a) return null;
  return apps.find((x) => {
    const n = x.name.toLowerCase().replace(/\s+/g, "");
    return n === a || n.includes(a) || a.includes(n);
  }) ?? null;
}

/** "3:07", "1:02:45". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Where it is now: the position read, moved on while it plays. */
export function positionNow(m: Media, readAt: number, now: number): number {
  const p = m.playing ? m.position + (now - readAt) / 1000 : m.position;
  return m.duration > 0 ? Math.min(m.duration, Math.max(0, p)) : Math.max(0, p);
}

/** The second line: the artist, or the app (a video has no artist). */
export function subtitle(m: Media): string {
  return [m.artist, m.app].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(" · ");
}

/** Sound waves: n bars 0–1 from how loud it plays, each moving on its own. */
export function bars(level: number, time: number, n = 4): number[] {
  const l = Math.min(1, Math.max(0, level));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const wobble = 0.55 + 0.45 * Math.abs(Math.sin(time * (2.1 + i * 0.83) + i * 1.7));
    out.push(Math.max(0.12, Math.min(1, l * 1.6 * wobble)));
  }
  return out;
}

/** A colour for the island's tint from a cover's average (r, g, b 0–255): darkened, as glass. */
export function tintOf(r: number, g: number, b: number): string {
  const k = 0.55;
  const c = (x: number) => Math.round(Math.min(255, Math.max(0, x)) * k);
  return `linear-gradient(160deg, rgba(${c(r)}, ${c(g)}, ${c(b)}, 0.85), rgba(0, 0, 0, 0) 70%)`;
}
