// The items of the island's bar, like a menu bar's: what each shows, in the
// order the user picked. The list of every item the island will have is
// here from the start; each says in which phase it arrives (ROADMAP.md), and
// those not built yet are offered greyed out in the settings.

import { language } from "../core/i18n.ts";

export type ItemId =
  | "clock" | "date" | "weather" | "battery" | "waves" | "countdown" | "water"
  | "recycle" | "keyboard" | "taskbar" | "event" | "notifications";

export interface ItemDef {
  id: ItemId;
  /** English key for t(). */
  name: string;
  /** The phase of ROADMAP.md it comes with. */
  phase: number;
}

export const ITEMS: readonly ItemDef[] = [
  { id: "clock", name: "Clock", phase: 1 },
  { id: "date", name: "Date", phase: 1 },
  { id: "notifications", name: "Notifications", phase: 2 },
  { id: "waves", name: "Sound waves", phase: 3 },
  { id: "countdown", name: "Countdown", phase: 4 },
  { id: "weather", name: "Weather", phase: 5 },
  { id: "battery", name: "Battery", phase: 2 },
  { id: "water", name: "Water", phase: 5 },
  { id: "event", name: "Next event", phase: 5 },
  { id: "recycle", name: "Recycle Bin", phase: 6 },
  { id: "keyboard", name: "Keyboard language", phase: 6 },
  { id: "taskbar", name: "Taskbar apps", phase: 6 },
];

/** The phase this build has reached: items beyond it are not drawn yet. */
export const BUILT_PHASE = 3;

export interface ItemPrefs {
  /** Shown in the small island (at most two). */
  small: ItemId[];
  /** Shown in the medium island, in order. */
  medium: ItemId[];
}

export const DEFAULT_ITEMS: ItemPrefs = { small: ["clock"], medium: ["date", "clock", "waves", "notifications", "battery"] };

const IDS = new Set(ITEMS.map((i) => i.id));

export function sanitizeItems(raw: unknown): ItemPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ItemPrefs>;
  const clean = (list: unknown, max: number, fallback: ItemId[]): ItemId[] => {
    if (!Array.isArray(list)) return [...fallback];
    const out: ItemId[] = [];
    for (const id of list) if (IDS.has(id) && !out.includes(id)) out.push(id);
    return out.slice(0, max);
  };
  return { small: clean(r.small, 2, DEFAULT_ITEMS.small), medium: clean(r.medium, 8, DEFAULT_ITEMS.medium) };
}

export interface ItemView {
  text: string;
}

/** What the island knows that some items show. */
export interface ItemContext {
  /** 0–1, or null when the PC has no battery (or it is unknown). */
  battery?: { level: number; charging: boolean } | null;
  /** Notifications that arrived since the list was last looked at. */
  unread?: number;
}

/** What an item shows now, or null when it has nothing (or is not built yet). */
export function itemView(id: ItemId, now: Date, ctx: ItemContext = {}): ItemView | null {
  switch (id) {
    case "clock":
      return { text: now.toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" }) };
    case "date":
      return { text: now.toLocaleDateString(language(), { weekday: "short", day: "numeric", month: "short" }) };
    case "battery": {
      const b = ctx.battery;
      if (!b) return null;
      return { text: `${b.charging ? "⚡" : ""}${Math.round(b.level * 100)}%` };
    }
    case "notifications":
      return ctx.unread ? { text: `● ${ctx.unread}` } : null;
    default:
      return null;
  }
}
