// Alarms: a time, on some weekdays (or once), with a name and a tone.
// Pure: tested on its own.

export interface Alarm {
  id: string;
  /** "07:30". */
  time: string;
  /** Weekdays 0 (Sunday)–6; empty: once, at the next time. */
  days: number[];
  label: string;
  tone: string;
  on: boolean;
}

export function parseTime(time: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? { h, m: min } : null;
}

/** When the alarm rings next, after `from` (ms), or null when off. */
export function nextRing(a: Alarm, from: number): number | null {
  const t = parseTime(a.time);
  if (!a.on || !t) return null;
  const d = new Date(from);
  for (let i = 0; i < 8; i++) {
    const c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, t.h, t.m, 0, 0);
    if (c.getTime() <= from) continue;
    if (a.days.length && !a.days.includes(c.getDay())) continue;
    return c.getTime();
  }
  return null;
}

/** The alarms that rang between `last` (excluded) and `now` (included). */
export function due(alarms: readonly Alarm[], last: number, now: number): Alarm[] {
  return alarms.filter((a) => {
    const n = nextRing(a, last);
    return n != null && n <= now;
  });
}

/** After a one-time alarm rang: it turns off. */
export function afterRing(a: Alarm): Alarm {
  return a.days.length ? a : { ...a, on: false };
}

export function sanitizeAlarms(raw: unknown): Alarm[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      id: typeof a.id === "string" ? a.id : String(Math.random()).slice(2),
      time: typeof a.time === "string" && parseTime(a.time) ? a.time : "",
      days: Array.isArray(a.days) ? [...new Set(a.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [],
      label: typeof a.label === "string" ? a.label.slice(0, 60) : "",
      tone: typeof a.tone === "string" ? a.tone : "bell",
      on: a.on !== false,
    }))
    .filter((a) => a.time)
    .slice(0, 30);
}
