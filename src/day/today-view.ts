// Today: the weather and the next days, the agenda, the tasks to do and the
// water of the day — on one page.

import { language, t } from "../core/i18n.ts";
import { el, icon, typing } from "../island/dom.ts";

import { dayKey } from "./day.ts";
import type { Occurrence } from "./ics.ts";
import type { DayStore } from "./store.ts";
import { sky } from "./weather.ts";

const PLUS = "M12 5v14M5 12h14";

export function when(o: Occurrence, now = Date.now()): string {
  const lang = language();
  const today = dayKey(now);
  const tomorrow = dayKey(now + 86_400_000);
  const day = dayKey(o.start);
  const d = day === today ? t("Today") : day === tomorrow ? t("Tomorrow") : new Date(o.start).toLocaleDateString(lang, { weekday: "short", day: "numeric" }).replace(".", "");
  return o.allDay ? d : `${d} ${new Date(o.start).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })}`;
}

export class TodayView {
  readonly el = el("div", "today");
  private input = el("input", "set-input");

  constructor(
    private day: DayStore,
    private place: () => string,
    private openSettings: () => void,
    private openNotes: () => void,
    hold: (on: boolean) => void,
  ) {
    this.input.placeholder = t("New task…");
    typing(this.input, hold);
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && this.input.value.trim()) {
        day.addTask(this.input.value, dayKey(Date.now()));
        this.input.value = "";
      }
    });
    day.onChange(() => {
      if (this.el.isConnected && document.activeElement !== this.input) this.paint();
    });
  }

  paint() {
    this.el.replaceChildren(this.weather(), this.agenda(), this.side());
  }

  private weather() {
    const box = el("div", "t-card t-weather");
    const w = this.day.weather;
    const place = this.place();
    if (!place && !w) {
      const b = el("button", "set-btn", t("Choose your city"));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openSettings();
      });
      box.append(el("span", "t-label", t("Weather")), el("p", "set-note", t("The weather comes from Open-Meteo, free and with no account.")), b);
      return box;
    }
    if (!w) {
      box.append(el("span", "t-label", place), el("p", "set-note", t("Loading…")));
      return box;
    }
    const s = sky(w.code, w.isDay);
    const now = el("div", "t-now");
    now.append(el("span", "t-icon", s.icon), el("b", "t-temp", `${w.temp}°`));
    box.append(el("span", "t-label", (place || "").toUpperCase()), now, el("span", "t-sky", `${t(s.label)} · ${t("feels {n}°", { n: w.feels })}`));
    const days = el("div", "t-days");
    for (const d of w.days.slice(1, 5)) {
      const name = new Date(`${d.date}T12:00`).toLocaleDateString(language(), { weekday: "short" }).replace(".", "");
      const c = el("span", "t-day");
      c.append(el("span", "", name), el("span", "t-day-icon", sky(d.code).icon), el("span", "", `${d.max}° ${d.min}°`));
      days.append(c);
    }
    box.append(days);
    return box;
  }

  private agenda() {
    const box = el("div", "t-card t-agenda");
    box.append(el("span", "t-label", t("AGENDA")));
    const list = this.day.upcoming(7, 8);
    if (!list.length) box.append(el("p", "set-note", this.day.events.length ? t("Nothing in the next days.") : t("Add your calendars (.ics links) in Settings → The day.")));
    for (const o of list) {
      const row = el("div", `t-event${o.start <= Date.now() ? " now" : ""}`);
      const text = el("div", "t-event-text");
      text.append(el("b", "", o.title || t("(no title)")), el("span", "", [when(o), o.location].filter(Boolean).join(" · ")));
      row.append(el("i", "t-bar"), text);
      box.append(row);
    }
    return box;
  }

  private side() {
    const col = el("div", "t-side");
    // Water.
    const water = el("div", "t-card t-water");
    const w = this.day.waterNow;
    const goal = this.day.settings().water.goal;
    const pct = Math.min(100, Math.round((w.ml / goal) * 100));
    const glass = el("span", "t-glass");
    glass.style.setProperty("--fill", `${pct}%`);
    const text = el("div", "t-water-text");
    text.append(el("b", "", `${(w.ml / 1000).toLocaleString(language(), { maximumFractionDigits: 2 })} / ${(goal / 1000).toLocaleString(language())} L`), el("span", "", pct >= 100 ? t("Goal reached!") : t("{n}% of the goal", { n: pct })));
    const add = el("button", "t-add");
    add.title = t("I drank a glass");
    add.append(icon(PLUS, 16));
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      this.day.drink();
    });
    water.append(glass, text, add);

    // Tasks.
    const tasks = el("div", "t-card t-tasks");
    const head = el("div", "t-tasks-head");
    const all = el("button", "set-btn quiet", t("All"));
    all.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openNotes();
    });
    head.append(el("span", "t-label", t("TASKS")), all);
    tasks.append(head);
    for (const task of this.day.tasks.filter((x) => !x.done).slice(0, 4)) {
      const row = el("label", "t-task");
      const box = el("input");
      box.type = "checkbox";
      box.addEventListener("click", (e) => e.stopPropagation());
      box.addEventListener("change", () => this.day.toggleTask(task.id));
      row.append(box, el("span", "", task.text));
      tasks.append(row);
    }
    tasks.append(this.input);
    col.append(water, tasks);
    return col;
  }
}

