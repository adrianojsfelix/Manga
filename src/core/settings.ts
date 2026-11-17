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
  };
  island: {
    shape: "notch" | "floating";
    /** The size it rests at. */
    rest: "small" | "medium";
    /** 0.8–1.4. */
    scale: number;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  provider: "claude",
  ai: { claude: { mode: "key", model: "" }, gemini: { mode: "key", model: "" } },
  notifications: { on: true, ignored: [], seconds: 6 },
  island: { shape: "notch", rest: "small", scale: 1 },
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

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
    },
    island: {
      shape: i.shape === "floating" || i.shape === "notch" ? i.shape : d.island.shape,
      rest: i.rest === "medium" || i.rest === "small" ? i.rest : d.island.rest,
      scale: typeof i.scale === "number" && Number.isFinite(i.scale) ? Math.round(Math.min(1.4, Math.max(0.8, i.scale)) * 20) / 20 : d.island.scale,
    },
  };
}
