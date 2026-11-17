// The day at work: the weather (every 20 minutes), the calendars (every 15),
// tasks, notes and the water of the day — saved in the page's storage —
// and the water reminder.

import { Bridge, IN_APP } from "../core/bridge.ts";
import type { Settings } from "../core/settings.ts";
import { drink, remindWater, sanitizeNotes, sanitizeTasks, waterToday, newTask, sortTasks, type Note, type Task, type WaterState } from "./day.ts";
import { occurrences, parseIcs, type CalEvent, type Occurrence } from "./ics.ts";
import { forecastUrl, parseWeather, type Weather } from "./weather.ts";

function load(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function keep(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage off */
  }
}

// What the browser preview shows (no internet from there).
const SAMPLE_WEATHER: Weather = {
  temp: 27, feels: 29, code: 2, humidity: 68, wind: 12, isDay: true,
  days: [0, 1, 2, 3, 4, 5].map((i) => {
    const d = new Date(Date.now() + i * 86_400_000);
    return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, max: [30, 28, 26, 29, 31, 27][i], min: [22, 21, 20, 21, 23, 22][i], code: [2, 61, 63, 1, 0, 3][i], rain: [10, 70, 85, 20, 0, 30][i] };
  }),
};

function sampleEvents(): CalEvent[] {
  const at = (d: number, h: number, m = 0) => {
    const x = new Date();
    x.setDate(x.getDate() + d);
    x.setHours(h, m, 0, 0);
    return x.getTime();
  };
  const ev = (title: string, start: number, mins: number, location = ""): CalEvent => ({ title, start, end: start + mins * 60_000, allDay: false, location, rrule: null, exdates: [], calendar: "Exemplo" });
  return [ev("Daily do time", at(0, 9, 30), 15), ev("Reunião de planejamento", at(0, 15), 60, "Sala 2"), ev("Dentista", at(1, 10), 45), ev("Aniversário da Ana", at(2, 19), 120)];
}

export class DayStore {
  weather: Weather | null = null;
  weatherAt = 0;
  events: CalEvent[] = [];
  eventsAt = 0;
  tasks: Task[] = sanitizeTasks(load("manga.tasks"));
  notes: Note[] = sanitizeNotes(load("manga.notes"));
  water: WaterState = waterToday(load("manga.water") as WaterState | null, Date.now());
  error = "";
  private listeners = new Set<() => void>();

  constructor(
    readonly settings: () => Settings["day"],
    private remind: () => void,
  ) {
    void this.refresh();
    window.setInterval(() => void this.refresh(), 60_000);
    window.setInterval(() => {
      if (remindWater(this.water, this.settings().water, Date.now())) {
        // Counted as a reminder, so the next comes after another interval.
        this.water = { ...waterToday(this.water, Date.now()), last: Date.now() };
        keep("manga.water", this.water);
        this.remind();
      }
    }, 30_000);
  }

  onChange(f: () => void) {
    this.listeners.add(f);
  }

  private changed() {
    for (const f of this.listeners) f();
  }

  private async get(url: string): Promise<string | null> {
    const r = await Bridge.fetchText(url.replace(/^webcal:/, "https:"));
    if ("error" in r) {
      this.error = r.error;
      return null;
    }
    return r.ok;
  }

  /** The weather every 20 minutes, the calendars every 15 (or now, forced). */
  async refresh(force = false) {
    const s = this.settings();
    const now = Date.now();
    let changed = false;
    if (!IN_APP) {
      this.weather ??= SAMPLE_WEATHER;
      if (!this.events.length) this.events = sampleEvents();
      this.changed();
      return;
    }
    this.error = "";
    if (s.place && (force || now - this.weatherAt > 20 * 60_000)) {
      const text = await this.get(forecastUrl(s.place));
      const w = text ? parseWeather(text) : null;
      if (w) {
        this.weather = w;
        this.weatherAt = now;
        changed = true;
      }
    }
    if (force || now - this.eventsAt > 15 * 60_000) {
      const lists = await Promise.all(s.calendars.map(async (u) => parseIcs((await this.get(u)) ?? "")));
      this.events = lists.flat();
      this.eventsAt = now;
      changed = true;
    }
    if (changed) this.changed();
  }

  /** The next events, from now to `days` ahead. */
  upcoming(days = 7, limit = 30): Occurrence[] {
    const now = Date.now();
    return occurrences(this.events, now, now + days * 86_400_000, limit);
  }

  // ——— tasks ———
  addTask(text: string, due = "") {
    if (!text.trim()) return;
    this.tasks = sortTasks([...this.tasks, newTask(text, due)]);
    this.saveTasks();
  }

  toggleTask(id: string) {
    this.tasks = sortTasks(this.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    this.saveTasks();
  }

  removeTask(id: string | null) {
    this.tasks = id == null ? this.tasks.filter((t) => !t.done) : this.tasks.filter((t) => t.id !== id);
    this.saveTasks();
  }

  private saveTasks() {
    keep("manga.tasks", this.tasks);
    this.changed();
  }

  // ——— notes ———
  addNote(): Note {
    const n = { id: Math.random().toString(36).slice(2, 10), text: "", updated: Date.now() };
    this.notes = [n, ...this.notes];
    keep("manga.notes", this.notes);
    return n;
  }

  editNote(id: string, text: string) {
    this.notes = this.notes.map((n) => (n.id === id ? { ...n, text, updated: Date.now() } : n));
    keep("manga.notes", this.notes);
  }

  removeNote(id: string) {
    this.notes = this.notes.filter((n) => n.id !== id);
    keep("manga.notes", this.notes);
    this.changed();
  }

  // ——— water ———
  drink(ml = this.settings().water.cup) {
    this.water = drink(this.water, ml, Date.now());
    keep("manga.water", this.water);
    this.changed();
  }

  get waterNow(): WaterState {
    return waterToday(this.water, Date.now());
  }
}
