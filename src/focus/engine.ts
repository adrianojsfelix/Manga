// The focus section at work: the clock ticking, alarms ringing, the music
// (native lofi or a YouTube link), the rest screen in breaks. The island
// draws it (focus-view.ts) and shows the alarm (popups or itself).

import type { FocusSettings } from "../core/settings.ts";
import { t } from "../core/i18n.ts";
import { afterRing, due, sanitizeAlarms, type Alarm } from "./alarms.ts";
import { Lofi, type Station } from "./lofi.ts";
import {
  initial,
  pause,
  reset,
  sanitizeState,
  setMode,
  setTimer,
  skip,
  start,
  tick,
  type FocusState,
  type Mode,
  type Phase,
} from "./timer.ts";
import { embedUrl, parseYouTube, sanitizeLinks, type SavedLink } from "./youtube.ts";

export type Music = { kind: "station"; id: Station } | { kind: "link"; id: string };

export interface Ring {
  kind: "focus" | "break" | "timer" | "alarm";
  title: string;
  body: string;
  tone: string;
  /** The buttons on the alarm's card. */
  actions: { id: "start" | "plus5" | "snooze" | "dismiss"; label: string }[];
}

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

const PHASE_NAME: Record<Phase, string> = { focus: "Focus", short: "Short break", long: "Long break", timer: "Timer", stopwatch: "Stopwatch" };

export function phaseName(p: Phase): string {
  return t(PHASE_NAME[p]);
}

export class FocusEngine {
  state: FocusState;
  alarms: Alarm[];
  links: SavedLink[];
  music: Music | null = null;
  private lofi = new Lofi();
  private yt: HTMLIFrameElement | null = null;
  private lastAlarmCheck = Date.now();
  private listeners = new Set<() => void>();

  constructor(
    readonly settings: () => FocusSettings,
    private ring: (r: Ring) => void,
    private rest: (open: boolean, phase: Phase, endsAt: number) => void,
    private host: HTMLElement,
  ) {
    this.state = sanitizeState(load("manga.focus"), settings().prefs);
    this.alarms = sanitizeAlarms(load("manga.alarms"));
    this.links = sanitizeLinks(load("manga.links"));
    this.lofi.volume(settings().musicVolume);
    window.setInterval(() => this.tick(), 250);
  }

  onChange(f: () => void) {
    this.listeners.add(f);
  }

  private changed(save = true) {
    if (save) keep("manga.focus", this.state);
    for (const f of this.listeners) f();
  }

  private get prefs() {
    return this.settings().prefs;
  }

  // ——— the clock ———

  toggle() {
    const now = Date.now();
    this.state = this.state.running ? pause(this.state, now) : start(this.state, now);
    this.afterPhaseChange();
    this.changed();
  }

  reset() {
    this.state = reset(this.state, this.prefs);
    this.afterPhaseChange();
    this.changed();
  }

  skip() {
    this.state = skip(this.state, Date.now(), this.prefs).state;
    this.afterPhaseChange();
    this.changed();
  }

  setMode(m: Mode) {
    if (m === this.state.mode) return;
    this.state = setMode(this.state, m, this.prefs);
    this.afterPhaseChange();
    this.changed();
  }

  /** The timer: `minutes` long, started. */
  timer(minutes: number, go = true) {
    this.state = setTimer(this.state, minutes);
    if (go) this.state = start(this.state, Date.now());
    this.afterPhaseChange();
    this.changed();
  }

  /** The preferences changed: a stopped phase takes its new length. */
  prefsChanged() {
    if (!this.state.running && this.state.mode === "pomodoro") this.state = reset(this.state, this.prefs);
    this.lofi.volume(this.settings().musicVolume);
    this.changed();
  }

  private tick() {
    const now = Date.now();
    const r = tick(this.state, now, this.prefs);
    if (r.state !== this.state) {
      this.state = r.state;
      if (r.ended) this.ended(r.ended.ended, r.ended.next);
      this.afterPhaseChange();
      this.changed();
    }
    for (const a of due(this.alarms, this.lastAlarmCheck, now)) this.alarmRang(a);
    this.lastAlarmCheck = now;
  }

  private ended(ended: Phase, next: Phase | null) {
    const s = this.settings();
    const msg = s.alert.message.trim();
    if (ended === "timer") {
      this.ring({
        kind: "timer",
        title: t("Time's up!"),
        body: msg || t("Your timer finished."),
        tone: s.tone,
        actions: [
          { id: "plus5", label: t("+5 min") },
          { id: "dismiss", label: t("OK") },
        ],
      });
      return;
    }
    const toBreak = ended === "focus";
    const started = this.state.running;
    this.ring({
      kind: toBreak ? "focus" : "break",
      title: toBreak ? t("Focus done! Time to rest.") : t("Break over. Back to focus?"),
      body: msg || (toBreak ? t("{phase}: {min} minutes.", { phase: phaseName(next ?? "short"), min: Math.round(this.state.length / 60000) }) : t("Round {n} of {total}.", { n: this.state.round + 1, total: this.prefs.rounds })),
      tone: s.tone,
      actions: started
        ? [{ id: "dismiss", label: t("OK") }]
        : [
            { id: "start", label: toBreak ? t("Start break") : t("Start focus") },
            { id: "dismiss", label: t("Later") },
          ],
    });
  }

  /** The alarm card's buttons. */
  act(id: string) {
    if (id === "start" && !this.state.running) this.toggle();
    else if (id === "plus5") this.timer(5);
    else if (id === "snooze") {
      const at = new Date(Date.now() + 5 * 60_000);
      const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
      this.addAlarm({ id: `snooze-${Date.now()}`, time, days: [], label: t("Snooze"), tone: this.settings().tone, on: true });
    }
  }

  /** Breaks open the rest screen; music follows focus. */
  private afterPhaseChange() {
    const s = this.state;
    const breakRunning = s.running && (s.phase === "short" || s.phase === "long");
    this.rest(breakRunning && this.settings().rest, s.phase, s.endsAt ?? 0);
    if (this.settings().withFocus && this.music && s.mode === "pomodoro") {
      const focusing = s.running && s.phase === "focus";
      if (focusing && !this.musicOn) this.playMusic(this.music);
      if (!focusing && this.musicOn) this.pauseMusic();
    }
  }

  // ——— alarms ———

  private alarmRang(a: Alarm) {
    this.alarms = this.alarms.map((x) => (x.id === a.id ? afterRing(x) : x)).filter((x) => !(x.id.startsWith("snooze-") && !x.on));
    keep("manga.alarms", this.alarms);
    this.ring({
      kind: "alarm",
      title: a.label || t("Alarm"),
      body: `${a.time}${this.settings().alert.message.trim() ? ` · ${this.settings().alert.message.trim()}` : ""}`,
      tone: a.tone,
      actions: [
        { id: "snooze", label: t("Snooze 5 min") },
        { id: "dismiss", label: t("Dismiss") },
      ],
    });
    this.changed(false);
  }

  addAlarm(a: Alarm) {
    this.alarms = sanitizeAlarms([...this.alarms, a]);
    keep("manga.alarms", this.alarms);
    this.changed(false);
  }

  updateAlarm(id: string, change: Partial<Alarm>) {
    this.alarms = this.alarms.map((a) => (a.id === id ? { ...a, ...change } : a));
    keep("manga.alarms", this.alarms);
    this.changed(false);
  }

  removeAlarm(id: string) {
    this.alarms = this.alarms.filter((a) => a.id !== id);
    keep("manga.alarms", this.alarms);
    this.changed(false);
  }

  // ——— music ———

  musicOn = false;

  addLink(url: string, title: string): boolean {
    if (!parseYouTube(url)) return false;
    this.links = sanitizeLinks([...this.links, { id: String(Date.now()), title: title || "YouTube", url }]);
    keep("manga.links", this.links);
    this.changed(false);
    return true;
  }

  removeLink(id: string) {
    this.links = this.links.filter((l) => l.id !== id);
    keep("manga.links", this.links);
    if (this.music?.kind === "link" && this.music.id === id) this.stopMusic();
    this.changed(false);
  }

  playMusic(m: Music) {
    this.pauseMusic();
    this.music = m;
    this.musicOn = true;
    if (m.kind === "station") this.lofi.play(m.id);
    else {
      const link = this.links.find((l) => l.id === m.id);
      const ref = link && parseYouTube(link.url);
      if (ref) {
        this.yt = document.createElement("iframe");
        this.yt.className = "yt-player";
        this.yt.allow = "autoplay; encrypted-media";
        this.yt.src = embedUrl(ref);
        this.yt.addEventListener("load", () => this.ytVolume());
        this.host.append(this.yt);
      }
    }
    this.changed(false);
  }

  private pauseMusic() {
    this.lofi.stop();
    this.yt?.remove();
    this.yt = null;
    this.musicOn = false;
  }

  stopMusic() {
    this.pauseMusic();
    this.changed(false);
  }

  setMusicVolume(v: number) {
    this.lofi.volume(v);
    this.ytVolume(v);
  }

  private ytVolume(v = this.settings().musicVolume) {
    this.yt?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [Math.round(v * 100)] }), "*");
  }
}

export { initial };
