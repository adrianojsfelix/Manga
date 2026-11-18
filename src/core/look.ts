// How the island looks and behaves, the user's way: its colour and glass,
// the accent, the glow, the font, opening on hover, how fast it folds, full
// screen, the screen it lives on; and profiles that keep a whole look under
// a name. Pure: tested on its own.

export interface LookPrefs {
  /** The island's colour, "#rrggbb". */
  color: string;
  /** 0.5–1: below 1 the island is see-through, like glass. */
  glass: number;
  /** Buttons, toggles and the glow, "#rrggbb". */
  accent: string;
  glow: boolean;
  font: "mono" | "sans";
  /** Opens with a click, or by resting the pointer on it. */
  open: "click" | "hover";
  /** Seconds before it folds back once the pointer leaves. */
  fold: number;
  /** While an app is in full screen: step aside, or stay. */
  fullscreen: "hide" | "keep";
  /** "current", "primary" or a monitor's number. */
  monitor: string;
}

export const DEFAULT_LOOK: LookPrefs = { color: "#000000", glass: 1, accent: "#8b7cf6", glow: false, font: "mono", open: "click", fold: 1.2, fullscreen: "hide", monitor: "current" };

const HEX = /^#[0-9a-f]{6}$/i;

export function sanitizeLook(raw: unknown): LookPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LOOK;
  const num = (v: unknown, lo: number, hi: number, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  return {
    color: typeof r.color === "string" && HEX.test(r.color) ? r.color.toLowerCase() : d.color,
    glass: Math.round(num(r.glass, 0.5, 1, d.glass) * 100) / 100,
    accent: typeof r.accent === "string" && HEX.test(r.accent) ? r.accent.toLowerCase() : d.accent,
    glow: typeof r.glow === "boolean" ? r.glow : d.glow,
    font: r.font === "sans" || r.font === "mono" ? r.font : d.font,
    open: r.open === "hover" || r.open === "click" ? r.open : d.open,
    fold: Math.round(num(r.fold, 0.3, 6, d.fold) * 10) / 10,
    fullscreen: r.fullscreen === "keep" || r.fullscreen === "hide" ? r.fullscreen : d.fullscreen,
    monitor: typeof r.monitor === "string" && /^(current|primary|\d{1,2})$/.test(r.monitor) ? r.monitor : d.monitor,
  };
}

/** The island's background: its colour at its glass. */
export function background(color: string, glass: number): string {
  const n = parseInt(HEX.test(color) ? color.slice(1) : "000000", 16);
  const a = Math.min(1, Math.max(0, glass));
  return a >= 1 ? color : `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Text that reads on a colour: dark on light colours, light on dark. */
export function inkOn(color: string): string {
  const n = parseInt(HEX.test(color) ? color.slice(1) : "000000", 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 150 ? "#17131f" : "#f5f3fa";
}

export interface Profile<T> {
  name: string;
  data: T;
}

/** Saves a profile under a name (the same name replaces it), newest first. */
export function saveProfile<T>(list: readonly Profile<T>[], name: string, data: T): Profile<T>[] {
  const n = name.trim().slice(0, 30);
  if (!n) return list.slice();
  return [{ name: n, data }, ...list.filter((p) => p.name.toLowerCase() !== n.toLowerCase())].slice(0, 12);
}
