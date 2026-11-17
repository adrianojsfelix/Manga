import { DEFAULT_PREFS, sanitizePrefs, type FocusPrefs } from "../focus/timer.ts";

// What the user sets, saved in the page's storage (never the API keys: those
// go to Windows' Credential Manager through Rust). Pure: tested on its own.

export type Provider = "claude" | "gemini";
/** "key": the API with the user's key; "subscription": the provider's own CLI, signed in. */
export type Mode = "key" | "subscription";

export interface AiPrefs {
  mode: Mode;
  /** Empty for the default model. */
  model: string;
}

export interface Settings {
  provider: Provider;
  ai: Record<Provider, AiPrefs>;
  notifications: {
    on: boolean;
    /** Apps whose notifications the island does not show. */
    ignored: string[];
    /** Seconds a notification stays on the island. */
    seconds: number;
    /** Do not disturb: they go to the list, without a banner. */
    quiet: boolean;
  };
  focus: FocusSettings;
  claudeCode: {
    /** Permissions and questions come to the island (off: the terminal, as always). */
    ask: boolean;
  };
  island: {
    shape: "notch" | "floating";
    /** The size it rests at. */
    rest: "small" | "medium";
    /** 0.8–1.4. */
    scale: number;
  };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** How the alarm's card looks and what Kumo does on it. */
export type AlertPlace = "center" | "top" | "island";
export type AlertMood = "proud" | "happy" | "love" | "surprised" | "sleepy";

export interface FocusSettings {
  prefs: FocusPrefs;
  /** The tone for focus, timer and new alarms. */
  tone: string;
  /** 0–1. */
  volume: number;
  /** A rest screen during breaks; skip: it has a button to skip. */
  rest: boolean;
  restSkip: boolean;
  /** The music plays while focusing and pauses in breaks. */
  withFocus: boolean;
  musicVolume: number;
  alert: { place: AlertPlace; mood: AlertMood; message: string; color: string; repeat: boolean };
}

export const DEFAULT_FOCUS: FocusSettings = {
  prefs: DEFAULT_PREFS,
  tone: "bell",
  volume: 0.7,
  rest: true,
  restSkip: true,
  withFocus: true,
  musicVolume: 0.6,
  alert: { place: "center", mood: "proud", message: "", color: "#8b7cf6", repeat: true },
};

const MOODS: AlertMood[] = ["proud", "happy", "love", "surprised", "sleepy"];

export function sanitizeFocus(raw: unknown): FocusSettings {
  const r = obj(raw);
  const a = obj(r.alert);
  const d = DEFAULT_FOCUS;
  const unit = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def);
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  return {
    prefs: sanitizePrefs(r.prefs),
    tone: typeof r.tone === "string" ? r.tone : d.tone,
    volume: unit(r.volume, d.volume),
    rest: bool(r.rest, d.rest),
    restSkip: bool(r.restSkip, d.restSkip),
    withFocus: bool(r.withFocus, d.withFocus),
    musicVolume: unit(r.musicVolume, d.musicVolume),
    alert: {
      place: a.place === "top" || a.place === "island" || a.place === "center" ? a.place : d.alert.place,
      mood: MOODS.includes(a.mood as AlertMood) ? (a.mood as AlertMood) : d.alert.mood,
      message: typeof a.message === "string" ? a.message.slice(0, 120) : "",
      color: typeof a.color === "string" && /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : d.alert.color,
      repeat: bool(a.repeat, d.alert.repeat),
    },
  };
}

export const DEFAULT_SETTINGS: Settings = {
  provider: "claude",
  ai: { claude: { mode: "key", model: "" }, gemini: { mode: "key", model: "" } },
  notifications: { on: true, ignored: [], seconds: 6, quiet: false },
  focus: DEFAULT_FOCUS,
  claudeCode: { ask: true },
  island: { shape: "notch", rest: "small", scale: 1 },
};


function ai(raw: unknown, fallback: AiPrefs): AiPrefs {
  const r = obj(raw);
  return {
    mode: r.mode === "subscription" || r.mode === "key" ? r.mode : fallback.mode,
    model: typeof r.model === "string" ? r.model.trim().slice(0, 80) : fallback.model,
  };
}

export function sanitizeSettings(raw: unknown): Settings {
  const r = obj(raw);
  const n = obj(r.notifications);
  const i = obj(r.island);
  const d = DEFAULT_SETTINGS;
  const ignored = Array.isArray(n.ignored) ? n.ignored.filter((a): a is string => typeof a === "string" && a.trim() !== "") : [];
  const seconds = typeof n.seconds === "number" && Number.isFinite(n.seconds) ? Math.round(Math.min(30, Math.max(2, n.seconds))) : d.notifications.seconds;
  return {
    provider: r.provider === "gemini" || r.provider === "claude" ? r.provider : d.provider,
    ai: { claude: ai(obj(r.ai).claude, d.ai.claude), gemini: ai(obj(r.ai).gemini, d.ai.gemini) },
    notifications: {
      on: typeof n.on === "boolean" ? n.on : d.notifications.on,
      ignored: [...new Set(ignored.map((a) => a.trim()))].slice(0, 100),
      seconds,
      quiet: typeof n.quiet === "boolean" ? n.quiet : d.notifications.quiet,
    },
    focus: sanitizeFocus(r.focus),
    claudeCode: { ask: typeof obj(r.claudeCode).ask === "boolean" ? (obj(r.claudeCode).ask as boolean) : d.claudeCode.ask },
    island: {
      shape: i.shape === "floating" || i.shape === "notch" ? i.shape : d.island.shape,
      rest: i.rest === "medium" || i.rest === "small" ? i.rest : d.island.rest,
      scale: typeof i.scale === "number" && Number.isFinite(i.scale) ? Math.round(Math.min(1.4, Math.max(0.8, i.scale)) * 20) / 20 : d.island.scale,
    },
  };
}
