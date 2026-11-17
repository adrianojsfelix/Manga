// Calendars in iCalendar (.ics): Google, Outlook and Apple all give a link
// to one. The events, their repeats (daily, weekly on some days, monthly,
// yearly; until a date or a count; with exceptions), the next ones.
// Times with a TZID are read as local time. Pure: tested on its own.

export interface CalEvent {
  title: string;
  /** Ms. */
  start: number;
  end: number;
  allDay: boolean;
  location: string;
  rrule: Rule | null;
  exdates: number[];
  calendar: string;
}

export interface Rule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  until: number | null;
  count: number | null;
  /** Weekdays 0–6 (WEEKLY). */
  byDay: number[];
}

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** "20261117T100000Z", "20261117T100000", "20261117". */
export function icsDate(v: string): { ms: number; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { ms: new Date(+y, +mo - 1, +d).getTime(), allDay: true };
  const ms = z ? Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) : new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
  return { ms, allDay: false };
}

function unescape(s: string): string {
  return s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

export function parseRule(v: string): Rule | null {
  const p = Object.fromEntries(v.split(";").map((kv) => kv.split("=") as [string, string]));
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(p.FREQ)) return null;
  return {
    freq: p.FREQ as Rule["freq"],
    interval: Math.max(1, Number(p.INTERVAL) || 1),
    until: p.UNTIL ? icsDate(p.UNTIL)?.ms ?? null : null,
    count: p.COUNT ? Number(p.COUNT) : null,
    byDay: p.BYDAY ? p.BYDAY.split(",").map((d) => DAYS.indexOf(d.slice(-2))).filter((d) => d >= 0) : [],
  };
}

export function parseIcs(text: string, calendar = ""): CalEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: CalEvent[] = [];
  let cur: Partial<CalEvent> | null = null;
  let name = calendar;
  for (const line of lines) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const head = line.slice(0, i);
    const value = line.slice(i + 1);
    const key = head.split(";")[0].toUpperCase();
    if (key === "X-WR-CALNAME" && !calendar) name = unescape(value);
    if (key === "BEGIN" && value === "VEVENT") cur = { title: "", location: "", rrule: null, exdates: [], allDay: false };
    else if (key === "END" && value === "VEVENT" && cur) {
      if (cur.start != null) {
        const end = cur.end ?? (cur.allDay ? cur.start + 86_400_000 : cur.start + 3_600_000);
        out.push({ ...(cur as CalEvent), end, calendar: name });
      }
      cur = null;
    } else if (cur) {
      if (key === "SUMMARY") cur.title = unescape(value);
      else if (key === "LOCATION") cur.location = unescape(value);
      else if (key === "DTSTART") {
        const d = icsDate(value);
        if (d) {
          cur.start = d.ms;
          cur.allDay = d.allDay;
        }
      } else if (key === "DTEND") cur.end = icsDate(value)?.ms;
      else if (key === "RRULE") cur.rrule = parseRule(value);
      else if (key === "EXDATE") for (const v of value.split(",")) {
        const d = icsDate(v);
        if (d) cur.exdates!.push(d.ms);
      }
    }
  }
  return out;
}

function addTo(ms: number, freq: Rule["freq"], n: number): number {
  const d = new Date(ms);
  if (freq === "DAILY") d.setDate(d.getDate() + n);
  else if (freq === "WEEKLY") d.setDate(d.getDate() + 7 * n);
  else if (freq === "MONTHLY") d.setMonth(d.getMonth() + n);
  else d.setFullYear(d.getFullYear() + n);
  return d.getTime();
}

export interface Occurrence {
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  location: string;
  calendar: string;
}

/** The events (and repeats) that end after `from` and start before `to`, in order. */
export function occurrences(events: readonly CalEvent[], from: number, to: number, limit = 50): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of events) {
    const len = e.end - e.start;
    const push = (start: number) => {
      if (start + len > from && start < to && !e.exdates.includes(start)) out.push({ title: e.title, start, end: start + len, allDay: e.allDay, location: e.location, calendar: e.calendar });
    };
    const r = e.rrule;
    if (!r) {
      push(e.start);
      continue;
    }
    let n = 0;
    for (let k = 0; k < 2000; k++) {
      const base = addTo(e.start, r.freq, k * r.interval);
      if (base > to || (r.until != null && base > r.until)) break;
      const starts =
        r.freq === "WEEKLY" && r.byDay.length
          ? r.byDay
              .map((wd) => {
                const d = new Date(base);
                d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7));
                return d.getTime();
              })
              .filter((ms) => ms >= e.start)
              .sort((a, b) => a - b)
          : [base];
      for (const s of starts) {
        if (r.until != null && s > r.until) continue;
        if (r.count != null && n >= r.count) break;
        n++;
        push(s);
      }
      if (r.count != null && n >= r.count) break;
    }
  }
  return out.sort((a, b) => a.start - b.start).slice(0, limit);
}
