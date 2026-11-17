// The day's own things: tasks, notes, water. Pure: tested on their own.

export interface Task {
  id: string;
  text: string;
  done: boolean;
  /** "2026-11-17", or empty. */
  due: string;
}

export interface Note {
  id: string;
  text: string;
  /** Ms. */
  updated: number;
}

export interface WaterPrefs {
  on: boolean;
  /** Ml a day. */
  goal: number;
  /** Ml a cup. */
  cup: number;
  /** Minutes between reminders. */
  every: number;
  /** Hours the reminders run, from–to. */
  from: number;
  to: number;
}

export const DEFAULT_WATER: WaterPrefs = { on: true, goal: 2000, cup: 250, every: 60, from: 8, to: 22 };

export interface WaterState {
  /** "2026-11-17": the day it counts. */
  day: string;
  ml: number;
  /** Ms of the last cup or reminder. */
  last: number;
}

const id = () => Math.random().toString(36).slice(2, 10);

export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function newTask(text: string, due = ""): Task {
  return { id: id(), text: text.trim(), done: false, due };
}

/** Pending first (those due first), done last. */
export function sortTasks(list: readonly Task[]): Task[] {
  return [...list].sort((a, b) => Number(a.done) - Number(b.done) || (a.due || "9999").localeCompare(b.due || "9999"));
}

export function sanitizeTasks(raw: unknown): Task[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && typeof t.text === "string" && t.text.trim() !== "")
    .map((t) => ({ id: typeof t.id === "string" ? t.id : id(), text: (t.text as string).slice(0, 300), done: t.done === true, due: typeof t.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : "" }))
    .slice(0, 300);
}

export function sanitizeNotes(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is Record<string, unknown> => !!n && typeof n === "object" && typeof n.text === "string")
    .map((n) => ({ id: typeof n.id === "string" ? n.id : id(), text: (n.text as string).slice(0, 20_000), updated: typeof n.updated === "number" ? n.updated : 0 }))
    .slice(0, 200);
}

/** A note's title: its first line. */
export function noteTitle(n: Note): string {
  return n.text.split("\n").find((l) => l.trim())?.trim().slice(0, 60) ?? "";
}

/** Today's water (a new day starts from zero). */
export function waterToday(s: WaterState | null, now: number): WaterState {
  const day = dayKey(now);
  return s && s.day === day ? s : { day, ml: 0, last: now };
}

export function drink(s: WaterState, ml: number, now: number): WaterState {
  const t = waterToday(s, now);
  return { ...t, ml: Math.max(0, t.ml + ml), last: now };
}

/** Whether it is time to remind: on, within the hours, the goal not reached, `every` passed. */
export function remindWater(s: WaterState, p: WaterPrefs, now: number): boolean {
  if (!p.on) return false;
  const t = waterToday(s, now);
  const h = new Date(now).getHours();
  if (h < p.from || h >= p.to || t.ml >= p.goal) return false;
  return now - t.last >= p.every * 60_000;
}

export function sanitizeWater(raw: unknown): WaterPrefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (k: keyof WaterPrefs, lo: number, hi: number) => {
    const v = r[k];
    return typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : (DEFAULT_WATER[k] as number);
  };
  return { on: typeof r.on === "boolean" ? r.on : DEFAULT_WATER.on, goal: n("goal", 250, 6000), cup: n("cup", 50, 1000), every: n("every", 10, 360), from: n("from", 0, 23), to: n("to", 1, 24) };
}
