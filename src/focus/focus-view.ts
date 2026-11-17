// The focus page: pomodoro, timer, stopwatch and alarms on the left, the
// music (native lofi, saved YouTube links) on the right.

import { language, t } from "../core/i18n.ts";
import { el, icon, typing } from "../island/dom.ts";
import { I } from "../island/icons.ts";
import type { Alarm } from "./alarms.ts";
import { phaseName, type FocusEngine } from "./engine.ts";
import { STATIONS } from "./lofi.ts";
import { clock, progress, shown, type Mode } from "./timer.ts";

type Tab = Mode | "alarms";

const RESET = "M5 12a7 7 0 1 0 2.1-5M5 4.5V8h3.5";
const SKIP = "M6 6v12l8.5-6zM18 6v12";
const PLUS = "M12 5v14M5 12h14";
const TRASH = "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12";
const DAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

export class FocusView {
  readonly el = el("div", "focus");
  private tab: Tab;
  private big = el("div", "f-time");
  private ends = el("div", "f-ends");
  private bar = el("div", "f-fill");
  private linkInput = el("input", "set-input");
  private alarmTime = el("input", "set-input f-alarm-time");
  private alarmLabel = el("input", "set-input");
  private alarmDays: number[] = [];

  constructor(
    private engine: FocusEngine,
    private volume: () => number,
    private setVolume: (v: number) => void,
    hold: (on: boolean) => void,
  ) {
    this.tab = engine.state.mode;
    this.linkInput.placeholder = t("Paste a YouTube link");
    this.linkInput.spellcheck = false;
    this.linkInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.addLink();
    });
    typing(this.linkInput, hold);
    this.alarmTime.type = "time";
    this.alarmTime.value = "07:30";
    this.alarmLabel.placeholder = t("Name (optional)");
    typing(this.alarmTime, hold);
    typing(this.alarmLabel, hold);
    engine.onChange(() => {
      if (this.el.isConnected && !this.el.contains(document.activeElement)) this.paint();
    });
  }

  private addLink() {
    const url = this.linkInput.value.trim();
    if (!url) return;
    let title = "YouTube";
    try {
      title = new URL(url).searchParams.get("list") ? t("YouTube playlist") : "YouTube";
    } catch {
      /* kept */
    }
    if (this.engine.addLink(url, `${title} ${this.engine.links.length + 1}`)) this.linkInput.value = "";
    else this.linkInput.classList.add("bad");
    this.paint();
  }

  private btn(path: string, label: string, cls: string, act: () => void, size = 18) {
    const b = el("button", `f-btn ${cls}`);
    b.title = label;
    b.append(icon(path, size));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      act();
    });
    return b;
  }

  paint() {
    const e = this.engine;
    this.el.replaceChildren();

    const left = el("div", "f-left");
    const tabs = el("div", "f-tabs");
    for (const [id, label] of [
      ["pomodoro", "Pomodoro"],
      ["timer", "Timer"],
      ["stopwatch", "Stopwatch"],
      ["alarms", "Alarms"],
    ] as [Tab, string][]) {
      const b = el("button", `f-tab${this.tab === id ? " on" : ""}`, t(label));
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.tab = id;
        if (id !== "alarms") e.setMode(id);
        this.paint();
      });
      tabs.append(b);
    }
    left.append(tabs);
    if (this.tab === "alarms") this.alarms(left);
    else this.clock(left);

    this.el.append(left, this.music());
    this.frame();
  }

  private clock(left: HTMLElement) {
    const e = this.engine;
    const s = e.state;
    const phase = el("div", `f-phase ph-${s.phase}`);
    phase.append(el("span", "f-dot"), el("span", "", phaseName(s.phase)));
    if (s.mode === "pomodoro") {
      const dots = el("span", "f-rounds");
      for (let i = 0; i < e.settings().prefs.rounds; i++) dots.append(el("i", i < s.round % e.settings().prefs.rounds || (s.phase === "long" && i < e.settings().prefs.rounds) ? "done" : ""));
      phase.append(dots);
    }
    const track = el("div", `f-bar ph-${s.phase}`);
    track.append(this.bar);
    const row = el("div", "f-row");
    row.append(
      this.btn(s.running ? I.pause : I.play, s.running ? t("Pause") : t("Start"), "main", () => e.toggle(), 20),
      this.btn(RESET, t("Restart"), "", () => e.reset()),
    );
    if (s.mode === "pomodoro") row.append(this.btn(SKIP, t("Skip"), "", () => e.skip()));
    if (s.mode === "timer" && !s.running) {
      const presets = el("span", "f-presets");
      for (const m of [5, 10, 15, 25, 45, 60]) {
        const b = el("button", `chip${s.timerLength === m * 60000 ? " on" : ""}`, `${m}`);
        b.title = t("{n} minutes", { n: m });
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          e.timer(m, false);
        });
        presets.append(b);
      }
      const minus = this.btn("M5 12h14", "−1", "small", () => e.timer(Math.max(1, s.timerLength / 60000 - 1), false), 14);
      const plus = this.btn(PLUS, "+1", "small", () => e.timer(s.timerLength / 60000 + 1, false), 14);
      presets.append(minus, plus);
      row.append(presets);
    }
    left.append(phase, this.big, this.ends, track, row);
  }

  private alarms(left: HTMLElement) {
    const e = this.engine;
    const list = el("div", "f-alarms");
    if (!e.alarms.length) list.append(el("p", "set-note", t("No alarms yet.")));
    for (const a of e.alarms) list.append(this.alarmRow(a));
    const add = el("div", "f-alarm-add");
    const days = el("span", "f-days");
    DAYS.forEach((d, i) => {
      const b = el("button", `f-day${this.alarmDays.includes(i) ? " on" : ""}`, d);
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.alarmDays = this.alarmDays.includes(i) ? this.alarmDays.filter((x) => x !== i) : [...this.alarmDays, i];
        this.paint();
      });
      days.append(b);
    });
    const go = el("button", "set-btn", t("Add"));
    go.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!this.alarmTime.value) return;
      e.addAlarm({ id: String(Date.now()), time: this.alarmTime.value, days: this.alarmDays, label: this.alarmLabel.value.trim(), tone: e.settings().tone, on: true });
      this.alarmLabel.value = "";
      this.alarmDays = [];
      this.paint();
    });
    add.append(this.alarmTime, this.alarmLabel, days, go);
    left.append(list, add);
  }

  private alarmRow(a: Alarm) {
    const e = this.engine;
    const row = el("div", `f-alarm${a.on ? "" : " off"}`);
    const when = a.days.length === 7 ? t("Every day") : a.days.length ? a.days.map((d) => DAYS[d]).join(" ") : t("Once");
    const text = el("div", "f-alarm-text");
    text.append(el("b", "", a.time), el("span", "", [a.label, when].filter(Boolean).join(" · ")));
    const sw = el("button", `switch${a.on ? " on" : ""}`);
    sw.title = a.on ? t("On") : t("Off");
    sw.addEventListener("click", (ev) => {
      ev.stopPropagation();
      e.updateAlarm(a.id, { on: !a.on });
    });
    const del = this.btn(TRASH, t("Remove"), "small", () => e.removeAlarm(a.id), 14);
    row.append(text, sw, del);
    return row;
  }

  private music() {
    const e = this.engine;
    const box = el("div", "f-music");
    const head = el("div", "f-music-head");
    head.append(el("span", "ctl-title", t("Music")));
    if (e.musicOn) head.append(this.btn(I.pause, t("Stop"), "small", () => e.stopMusic(), 14));
    box.append(head);
    const stations = el("div", "f-stations");
    for (const st of STATIONS) {
      const on = e.musicOn && e.music?.kind === "station" && e.music.id === st.id;
      const b = el("button", `chip${on ? " on" : ""}`, t(st.name));
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (on) e.stopMusic();
        else e.playMusic({ kind: "station", id: st.id });
      });
      stations.append(b);
    }
    box.append(stations);
    const links = el("div", "f-links");
    for (const l of e.links) {
      const on = e.musicOn && e.music?.kind === "link" && e.music.id === l.id;
      const row = el("div", `f-link${on ? " on" : ""}`);
      const play = this.btn(on ? I.pause : I.play, on ? t("Stop") : t("Play"), "small", () => (on ? e.stopMusic() : e.playMusic({ kind: "link", id: l.id })), 13);
      const name = el("span", "f-link-name", l.title);
      name.title = l.url;
      row.append(play, name, this.btn(TRASH, t("Remove"), "small", () => e.removeLink(l.id), 13));
      links.append(row);
    }
    box.append(links);
    const add = el("div", "f-link-add");
    const plus = el("button", "set-btn quiet");
    plus.append(icon(PLUS, 13));
    plus.title = t("Save link");
    plus.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this.addLink();
    });
    add.append(this.linkInput, plus);
    box.append(add);
    const vol = el("input", "f-vol");
    vol.type = "range";
    vol.min = "0";
    vol.max = "100";
    vol.value = String(Math.round(this.volume() * 100));
    vol.addEventListener("click", (ev) => ev.stopPropagation());
    vol.addEventListener("input", () => this.setVolume(Number(vol.value) / 100));
    const volRow = el("div", "f-vol-row");
    volRow.append(icon(I.volume, 14), vol);
    box.append(volRow);
    return box;
  }

  /** The time, every frame. */
  frame() {
    const s = this.engine.state;
    if (this.tab === "alarms") return;
    const now = Date.now();
    const ms = shown(s, now);
    this.big.textContent = clock(ms);
    if (s.mode === "stopwatch") this.ends.textContent = s.running ? t("Counting") : "";
    else if (s.running && s.endsAt) {
      const at = new Date(s.endsAt).toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" });
      this.ends.textContent = t("Done at {time}", { time: at });
    } else this.ends.textContent = s.left < s.length ? t("Paused") : t("Ready");
    this.bar.style.width = `${progress(s, now) * 100}%`;
  }
}
