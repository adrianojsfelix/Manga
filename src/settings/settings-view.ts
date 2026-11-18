// The settings page, inside the island: the assistant (Claude and Gemini:
// key or subscription, the model), notifications, the island's look.
// The keys go straight to Windows' Credential Manager; this page only learns
// whether one is saved.

import { Bridge, IN_APP, type CcStatus, type Release, type SecretName } from "../core/bridge.ts";
import type { Session } from "../claude-code/sessions.ts";
import { t } from "../core/i18n.ts";
import type { Provider, Settings } from "../core/settings.ts";
import { el, typing } from "../island/dom.ts";
import { ago, type Notice } from "../notify/notices.ts";
import { language } from "../core/i18n.ts";
import type { AlertMood, AlertPlace, FocusSettings } from "../core/settings.ts";
import { TONES, playTone } from "../focus/tones.ts";
import { DOCK_PAGES } from "../core/settings.ts";
import { geocodeUrl, parsePlaces, type Place } from "../day/weather.ts";
import { saveProfile, type LookPrefs, type Profile } from "../core/look.ts";
import type { Page } from "../core/island-state.ts";
import { BUILT_PHASE, ITEMS, type ItemId, type ItemPrefs } from "../items/registry.ts";

type Tab = "assistant" | "claude" | "focus" | "day" | "notifications" | "island" | "look" | "about";

const SECRET: Record<Provider, SecretName> = { claude: "anthropic", gemini: "gemini" };
const AI: { id: Provider; name: string; keyHint: string; model: string; cli: string }[] = [
  { id: "claude", name: "Claude", keyHint: "sk-ant-…", model: "claude-opus-5-5", cli: "Claude Code (claude)" },
  { id: "gemini", name: "Gemini", keyHint: "AIza…", model: "gemini-2.5-flash", cli: "Gemini CLI (gemini)" },
];

export class SettingsView {
  readonly el = el("div", "settings");
  tab: Tab = "assistant";
  private hasKey: Partial<Record<Provider, boolean>> = {};

  constructor(
    private settings: () => Settings,
    private change: (s: Partial<Settings>) => void,
    private recent: () => readonly Notice[],
    private sessions: () => readonly Session[],
    private hold: (on: boolean) => void,
    private items: { get: () => ItemPrefs; set: (i: ItemPrefs) => void } = { get: () => ({ small: [], medium: [] }), set: () => {} },
  ) {
    void this.checkKeys();
    void this.checkClaudeCode();
  }

  private cc: CcStatus | null = null;
  private ccError = "";

  private async checkClaudeCode() {
    this.cc = await Bridge.ccStatus();
    this.paint();
  }

  private async checkKeys() {
    for (const a of AI) this.hasKey[a.id] = (await Bridge.secretHas(SECRET[a.id])) ?? false;
    this.paint();
  }

  paint() {
    const tabs = el("div", "set-tabs");
    for (const [id, label] of [["assistant", "Assistant"], ["claude", "Claude Code"], ["focus", "Focus"], ["day", "The day"], ["notifications", "Notifications"], ["island", "Island"], ["look", "Appearance"], ["about", "About"]] as [Tab, string][]) {
      const b = el("button", `set-tab${this.tab === id ? " on" : ""}`, t(label));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.tab = id;
        this.paint();
      });
      tabs.append(b);
    }
    const body = el("div", "set-body");
    if (this.tab === "assistant") this.assistant(body);
    else if (this.tab === "claude") this.claudeCode(body);
    else if (this.tab === "focus") this.focus(body);
    else if (this.tab === "day") this.dayTab(body);
    else if (this.tab === "look") this.lookTab(body);
    else if (this.tab === "about") this.aboutTab(body);
    else if (this.tab === "notifications") this.notifications(body);
    else this.island(body);
    this.el.replaceChildren(tabs, body);
  }

  private row(label: string, ...controls: Node[]) {
    const r = el("div", "set-row");
    r.append(el("span", "set-label", label), ...controls);
    return r;
  }

  private segmented<T extends string>(value: T, options: [T, string][], pick: (v: T) => void) {
    const s = el("div", "seg");
    for (const [v, label] of options) {
      const b = el("button", v === value ? "on" : "", label);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        pick(v);
        this.paint();
      });
      s.append(b);
    }
    return s;
  }

  private assistant(body: HTMLElement) {
    const s = this.settings();
    for (const a of AI) {
      const prefs = s.ai[a.id];
      const box = el("div", "set-box");
      box.append(el("div", "set-title", a.name));
      const setAi = (p: Partial<typeof prefs>) => this.change({ ai: { ...s.ai, [a.id]: { ...prefs, ...p } } });
      box.append(
        this.row(
          t("Connect with"),
          this.segmented(prefs.mode, [["key", t("API key")], ["subscription", t("Subscription")]], (mode) => setAi({ mode })),
        ),
      );
      if (prefs.mode === "key") {
        const key = el("input", "set-input");
        key.type = "password";
        key.autocomplete = "off";
        key.spellcheck = false;
        key.placeholder = this.hasKey[a.id] ? t("Saved in Windows ••••") : a.keyHint;
        typing(key, this.hold);
        const save = el("button", "set-btn", t("Save"));
        save.addEventListener("click", async (e) => {
          e.stopPropagation();
          const v = key.value.trim();
          if (!v) return;
          const ok = await Bridge.secretSet(SECRET[a.id], v);
          key.value = "";
          this.hasKey[a.id] = ok ?? false;
          this.paint();
        });
        const controls: Node[] = [key, save];
        if (this.hasKey[a.id]) {
          const clear = el("button", "set-btn quiet", t("Remove"));
          clear.addEventListener("click", async (e) => {
            e.stopPropagation();
            await Bridge.secretClear(SECRET[a.id]);
            this.hasKey[a.id] = false;
            this.paint();
          });
          controls.push(clear);
        }
        box.append(this.row(t("Key"), ...controls));
        const model = el("input", "set-input");
        model.value = prefs.model;
        model.placeholder = a.model;
        model.spellcheck = false;
        typing(model, this.hold);
        model.addEventListener("change", () => setAi({ model: model.value }));
        box.append(this.row(t("Model"), model));
        box.append(el("p", "set-note", IN_APP ? t("The key is kept in Windows' Credential Manager, never in a file.") : t("Keys are saved only in the app.")));
      } else {
        box.append(el("p", "set-note", t("Uses {cli} installed and signed in on this PC: your plan, no key.", { cli: a.cli })));
      }
      body.append(box);
    }
  }

  private audio: AudioContext | null = null;

  private number(value: number, min: number, max: number, set: (v: number) => void, unit = "min") {
    const wrap = el("span", "set-num");
    const input = el("input", "set-input");
    input.type = "number";
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    typing(input, this.hold);
    input.addEventListener("change", () => {
      const v = Math.round(Number(input.value));
      if (Number.isFinite(v)) set(Math.min(max, Math.max(min, v)));
    });
    wrap.append(input, el("span", "set-unit", unit));
    return wrap;
  }

  private focus(body: HTMLElement) {
    const f = this.settings().focus;
    const setF = (p: Partial<FocusSettings>) => this.change({ focus: { ...f, ...p } });
    const setP = (p: Partial<FocusSettings["prefs"]>) => setF({ prefs: { ...f.prefs, ...p } });
    const onOff = (v: boolean, set: (v: boolean) => void) => this.segmented(v ? "on" : "off", [["on", t("On")], ["off", t("Off")]], (x) => set(x === "on"));

    const times = el("div", "set-box");
    times.append(el("div", "set-title", "Pomodoro"));
    const grid = el("div", "set-grid");
    grid.append(
      this.row(t("Focus"), this.number(f.prefs.focus, 1, 180, (v) => setP({ focus: v }))),
      this.row(t("Short break"), this.number(f.prefs.short, 1, 60, (v) => setP({ short: v }))),
      this.row(t("Long break"), this.number(f.prefs.long, 1, 120, (v) => setP({ long: v }))),
      this.row(t("Rounds before the long break"), this.number(f.prefs.rounds, 1, 12, (v) => setP({ rounds: v }), "")),
    );
    times.append(
      grid,
      this.row(t("Start breaks by themselves"), onOff(f.prefs.autoBreak, (v) => setP({ autoBreak: v }))),
      this.row(t("Start focus by itself"), onOff(f.prefs.autoFocus, (v) => setP({ autoFocus: v }))),
      this.row(t("Rest screen in breaks"), onOff(f.rest, (v) => setF({ rest: v }))),
      this.row(t("Allow skipping the rest"), onOff(f.restSkip, (v) => setF({ restSkip: v }))),
      this.row(t("Music only while focusing"), onOff(f.withFocus, (v) => setF({ withFocus: v }))),
    );
    body.append(times);

    const sound = el("div", "set-box");
    sound.append(el("div", "set-title", t("Alarm tone")));
    const tones = el("div", "set-chips");
    for (const tn of TONES) {
      const b = el("button", `chip${f.tone === tn.id ? " on" : ""}`, `▶ ${t(tn.name)}`);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.audio ??= new AudioContext();
        void this.audio.resume();
        playTone(this.audio, tn.id, f.volume);
        setF({ tone: tn.id });
        this.paint();
      });
      tones.append(b);
    }
    const vol = el("input", "set-range");
    vol.type = "range";
    vol.min = "0";
    vol.max = "100";
    vol.value = String(Math.round(f.volume * 100));
    vol.addEventListener("change", () => setF({ volume: Number(vol.value) / 100 }));
    sound.append(tones, this.row(t("Volume"), vol));
    body.append(sound);

    const card = el("div", "set-box");
    card.append(el("div", "set-title", t("Alarm card")));
    const a = f.alert;
    const setA = (p: Partial<typeof a>) => setF({ alert: { ...a, ...p } });
    const colors = el("div", "set-chips");
    for (const c of ["#8b7cf6", "#f4505e", "#f59e0b", "#22c55e", "#0ea5e9", "#ec4899"]) {
      const sw = el("button", `swatch${a.color === c ? " on" : ""}`);
      sw.style.background = c;
      sw.addEventListener("click", (e) => {
        e.stopPropagation();
        setA({ color: c });
        this.paint();
      });
      colors.append(sw);
    }
    const msg = el("input", "set-input");
    msg.value = a.message;
    msg.placeholder = t("A message of your own (optional)");
    typing(msg, this.hold);
    msg.addEventListener("change", () => setA({ message: msg.value }));
    card.append(
      this.row(t("Where"), this.segmented<AlertPlace>(a.place, [["center", t("Center")], ["top", t("Top")], ["island", t("On the island")]], (place) => setA({ place }))),
      this.row(
        t("Manga's reaction"),
        this.segmented<AlertMood>(a.mood, [["proud", t("Proud")], ["happy", t("Happy")], ["love", t("Love")], ["surprised", t("Surprised")], ["sleepy", t("Sleepy")]], (mood) => setA({ mood })),
      ),
      this.row(t("Colour"), colors),
      this.row(t("Message"), msg),
      this.row(t("Ring until dismissed"), onOff(a.repeat, (v) => setA({ repeat: v }))),
    );
    body.append(card);
  }

  private monitorList: { index: number; name: string; width: number; height: number; primary: boolean }[] | null = null;
  private profileName = el("input", "set-input");

  private profiles(): Profile<{ look: LookPrefs; island: Settings["island"]; items: ItemPrefs }>[] {
    try {
      const raw = JSON.parse(localStorage.getItem("manga.profiles") ?? "[]");
      return Array.isArray(raw) ? raw.filter((p) => p && typeof p.name === "string" && p.data) : [];
    } catch {
      return [];
    }
  }

  private keepProfiles(list: unknown) {
    try {
      localStorage.setItem("manga.profiles", JSON.stringify(list));
    } catch {
      /* storage off */
    }
  }

  private swatches(value: string, colors: string[], set: (c: string) => void) {
    const box = el("div", "set-chips");
    for (const c of colors) {
      const sw = el("button", `swatch${value === c ? " on" : ""}`);
      sw.style.background = c;
      sw.title = c;
      sw.addEventListener("click", (e) => {
        e.stopPropagation();
        set(c);
        this.paint();
      });
      box.append(sw);
    }
    const pick = el("input", "swatch-pick");
    pick.type = "color";
    pick.value = value;
    pick.title = this.t("Another colour");
    pick.addEventListener("change", () => {
      set(pick.value);
      this.paint();
    });
    box.append(pick);
    return box;
  }

  private t(key: string) {
    return t(key);
  }

  private lookTab(body: HTMLElement) {
    const s = this.settings();
    const l = s.look;
    const setL = (p: Partial<LookPrefs>) => this.change({ look: { ...l, ...p } });

    const colors = el("div", "set-box");
    colors.append(el("div", "set-title", t("Colours")));
    const glass = el("input", "set-range");
    glass.type = "range";
    glass.min = "0.5";
    glass.max = "1";
    glass.step = "0.05";
    glass.value = String(l.glass);
    glass.addEventListener("change", () => setL({ glass: Number(glass.value) }));
    colors.append(
      this.row(t("Island"), this.swatches(l.color, ["#000000", "#16141f", "#1d2433", "#2a1d2e", "#13261f", "#2b2118"], (color) => setL({ color }))),
      this.row(t("Glass"), glass),
      this.row(t("Accent"), this.swatches(l.accent, ["#8b7cf6", "#f4505e", "#f59e0b", "#22c55e", "#0ea5e9", "#ec4899", "#e8e2d8"], (accent) => setL({ accent }))),
      this.row(t("Glow around"), this.segmented(l.glow ? "on" : "off", [["on", t("On")], ["off", t("Off")]], (v) => setL({ glow: v === "on" }))),
      this.row(t("Font of the top"), this.segmented(l.font, [["mono", t("Typewriter")], ["sans", t("Clean")]], (font) => setL({ font }))),
    );
    body.append(colors);

    const behave = el("div", "set-box");
    behave.append(el("div", "set-title", t("Behaviour")));
    const fold = el("input", "set-range");
    fold.type = "range";
    fold.min = "0.3";
    fold.max = "6";
    fold.step = "0.1";
    fold.value = String(l.fold);
    const foldLabel = el("span", "set-unit", `${l.fold.toLocaleString("pt-BR")} s`);
    fold.addEventListener("input", () => (foldLabel.textContent = `${Number(fold.value).toLocaleString("pt-BR")} s`));
    fold.addEventListener("change", () => setL({ fold: Number(fold.value) }));
    const monitors = this.monitorList;
    if (!monitors) void Bridge.monitors().then((m) => ((this.monitorList = m ?? []), this.paint()));
    const screens: [string, string][] = [["current", t("Where it is")], ["primary", t("Main screen")]];
    if (monitors && monitors.length > 1) for (const m of monitors) screens.push([String(m.index), `${t("Screen")} ${m.index + 1}${m.primary ? " ★" : ""}`]);
    behave.append(
      this.row(t("Opens with"), this.segmented(l.open, [["click", t("A click")], ["hover", t("The pointer resting")]], (open) => setL({ open }))),
      this.row(t("Folds after"), fold, foldLabel),
      this.row(t("Apps in full screen"), this.segmented(l.fullscreen, [["hide", t("Hide the island")], ["keep", t("Keep it")]], (fullscreen) => setL({ fullscreen }))),
      this.row(t("Screen"), this.segmented(l.monitor, screens, (monitor) => setL({ monitor }))),
    );
    body.append(behave);

    const prof = el("div", "set-box");
    prof.append(el("div", "set-title", t("Profiles")));
    prof.append(el("p", "set-note", t("Keep the whole look — colours, sizes, items, tabs — under a name, and switch with a click.")));
    const list = this.profiles();
    if (list.length) {
      const chips = el("div", "set-chips");
      for (const p of list) {
        const c = el("span", "profile");
        const use = el("button", "chip", p.name);
        use.title = t("Use this profile");
        use.addEventListener("click", (e) => {
          e.stopPropagation();
          this.change({ look: p.data.look, island: p.data.island });
          this.items.set(p.data.items);
          this.paint();
        });
        const del = el("button", "profile-del", "×");
        del.title = t("Remove");
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          this.keepProfiles(list.filter((x) => x.name !== p.name));
          this.paint();
        });
        c.append(use, del);
        chips.append(c);
      }
      prof.append(chips);
    }
    this.profileName.placeholder = t("Name (Work, Games, Focus…)");
    typing(this.profileName, this.hold);
    const save = el("button", "set-btn", t("Save the current look"));
    save.addEventListener("click", (e) => {
      e.stopPropagation();
      const name = this.profileName.value.trim();
      if (!name) return;
      this.keepProfiles(saveProfile(list, name, { look: s.look, island: s.island, items: this.items.get() }));
      this.profileName.value = "";
      this.paint();
    });
    prof.append(this.row(t("New profile"), this.profileName, save));
    body.append(prof);
  }

  private version = "";
  private autostart: boolean | null = null;
  private update: Release | null | undefined = undefined;
  private updateError = "";
  private checking = false;

  private async checkUpdate() {
    this.checking = true;
    this.paint();
    if (!IN_APP) {
      this.update = null;
    } else {
      const r = await Bridge.updateCheck();
      if ("error" in r) {
        this.updateError = r.error;
        this.update = undefined;
      } else {
        this.updateError = "";
        this.update = r.ok;
      }
      try {
        localStorage.setItem("manga.updateCheckedAt", String(Date.now()));
      } catch {
        /* storage off */
      }
    }
    this.checking = false;
    this.paint();
  }

  private aboutTab(body: HTMLElement) {
    const s = this.settings();
    if (!this.version) {
      void Promise.all([Bridge.appVersion(), Bridge.autostartGet()]).then(([v, a]) => {
        this.version = v ?? "0.8.0";
        this.autostart = a;
        this.paint();
      });
    }
    const box = el("div", "set-box about");
    const head = el("div", "about-head");
    head.append(el("b", "", "Manga"), el("span", "set-note", this.version ? `${t("version")} ${this.version}` : ""));
    box.append(head, el("p", "set-note", t("An island at the top of Windows. Your keys stay in Windows' Credential Manager; nothing is sent anywhere but where you ask (the AIs, the weather, your calendars, feeds and boards).")));
    box.append(
      this.row(
        t("Start with Windows"),
        this.segmented(this.autostart ? "on" : "off", [["on", t("On")], ["off", t("Off")]], (v) => {
          void Bridge.autostartSet(v === "on").then(() => Bridge.autostartGet().then((a) => ((this.autostart = a), this.paint())));
        }),
      ),
    );
    body.append(box);

    const up = el("div", "set-box");
    up.append(el("div", "set-title", t("Updates")));
    const check = el("button", "set-btn", this.checking ? t("Looking…") : t("Look for a new version"));
    check.disabled = this.checking;
    check.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.checkUpdate();
    });
    up.append(
      this.row(t("Look once a day"), this.segmented(s.updates ? "on" : "off", [["on", t("On")], ["off", t("Off")]], (v) => this.change({ updates: v === "on" }))),
      this.row("", check),
    );
    if (this.updateError) up.append(el("p", "set-note error", this.updateError));
    if (this.update === null) up.append(el("p", "set-note ok", t("You have the newest version.")));
    if (this.update) {
      const u = this.update;
      const card = el("div", "update-card");
      card.append(el("b", "", t("Manga {v} is out!", { v: u.version })));
      if (u.notes) card.append(el("pre", "update-notes", u.notes.slice(0, 600)));
      const row = el("div", "f-row");
      if (u.installer) {
        const get = el("button", "set-btn", t("Download and install"));
        get.addEventListener("click", async (e) => {
          e.stopPropagation();
          const r = await Bridge.downloadUrl(u.installer!);
          this.updateError = "error" in r ? r.error : "";
          if (!("error" in r)) get.textContent = t("Downloading… open it when it finishes");
          get.disabled = true;
        });
        row.append(get);
      }
      if (u.page) {
        const page = el("button", "set-btn quiet", t("See what changed"));
        page.addEventListener("click", (e) => {
          e.stopPropagation();
          void Bridge.openUrl(u.page);
        });
        row.append(page);
      }
      card.append(row);
      up.append(card);
    }
    body.append(up);
  }

  private places: Place[] = [];
  private placeError = "";
  private city = el("input", "set-input");
  private calendar = el("input", "set-input");

  private dayTab(body: HTMLElement) {
    const s = this.settings();
    const d = s.day;
    const setD = (p: Partial<typeof d>) => this.change({ day: { ...d, ...p } });

    const weather = el("div", "set-box");
    weather.append(el("div", "set-title", t("Weather")));
    this.city.placeholder = d.place?.label ?? t("Your city");
    typing(this.city, this.hold);
    const search = el("button", "set-btn", t("Search"));
    const find = async () => {
      const q = this.city.value.trim();
      if (!q) return;
      if (!IN_APP) {
        this.places = [{ name: q, label: `${q}, Brasil`, lat: -23.5, lon: -46.6 }];
      } else {
        const r = await Bridge.fetchText(geocodeUrl(q));
        this.placeError = "error" in r ? r.error : "";
        this.places = "error" in r ? [] : parsePlaces(r.ok);
        if (!this.places.length && !this.placeError) this.placeError = t("No city with that name.");
      }
      this.paint();
    };
    search.addEventListener("click", (e) => {
      e.stopPropagation();
      void find();
    });
    this.city.onkeydown = (e) => {
      if (e.key === "Enter") void find();
    };
    weather.append(this.row(t("City"), this.city, search));
    if (d.place) weather.append(el("p", "set-note", t("Now: {place}", { place: d.place.label })));
    if (this.placeError) weather.append(el("p", "set-note error", this.placeError));
    if (this.places.length) {
      const list = el("div", "set-chips");
      for (const p of this.places) {
        const b = el("button", "chip", p.label);
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          setD({ place: p });
          this.places = [];
          this.city.value = "";
          this.paint();
        });
        list.append(b);
      }
      weather.append(list);
    }
    weather.append(el("p", "set-note", t("From Open-Meteo: free, no account, only the city's position is sent.")));
    body.append(weather);

    const cal = el("div", "set-box");
    cal.append(el("div", "set-title", t("Calendars")));
    for (const u of d.calendars) {
      const row = el("div", "f-link");
      const del = el("button", "set-btn quiet", t("Remove"));
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        setD({ calendars: d.calendars.filter((x) => x !== u) });
        this.paint();
      });
      row.append(el("span", "f-link-name", u), del);
      cal.append(row);
    }
    this.calendar.placeholder = "https://calendar.google.com/calendar/ical/…/basic.ics";
    typing(this.calendar, this.hold);
    const add = el("button", "set-btn", t("Add"));
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      const v = this.calendar.value.trim();
      const ok = /^(https|webcal):\/\//.test(v);
      this.calendar.classList.toggle("bad", !ok);
      if (!ok) return;
      setD({ calendars: [...d.calendars, v] });
      this.calendar.value = "";
      this.paint();
    });
    cal.append(this.row(t("Link (.ics)"), this.calendar, add));
    cal.append(el("p", "set-note", t("Google Calendar: Settings → your calendar → Secret address in iCal format. Outlook: Publish calendar → ICS.")));
    body.append(cal);

    const w = d.water;
    const setW = (p: Partial<typeof w>) => setD({ water: { ...w, ...p } });
    const water = el("div", "set-box");
    water.append(el("div", "set-title", t("Water")));
    water.append(
      this.row(t("Reminders"), this.segmented(w.on ? "on" : "off", [["on", t("On")], ["off", t("Off")]], (v) => setW({ on: v === "on" }))),
      this.row(t("Daily goal"), this.number(w.goal, 250, 6000, (v) => setW({ goal: v }), "ml")),
      this.row(t("A glass"), this.number(w.cup, 50, 1000, (v) => setW({ cup: v }), "ml")),
      this.row(t("Every"), this.number(w.every, 10, 360, (v) => setW({ every: v }), "min")),
      this.row(t("From"), this.number(w.from, 0, 23, (v) => setW({ from: v }), "h"), el("span", "set-unit", t("to")), this.number(w.to, 1, 24, (v) => setW({ to: v }), "h")),
    );
    body.append(water);
  }

  private claudeCode(body: HTMLElement) {
    const s = this.settings();
    const box = el("div", "set-box");
    const connected = this.cc?.hooks ?? false;
    const btn = el("button", `set-btn${connected ? " quiet" : ""}`, connected ? t("Disconnect") : t("Connect"));
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const r = await Bridge.ccConnect(!connected);
      if ("ok" in r) {
        this.cc = r.ok;
        this.ccError = "";
      } else this.ccError = r.error;
      this.paint();
    });
    box.append(this.row("Claude Code", el("span", `set-state${connected ? " ok" : ""}`, connected ? t("Connected") : t("Not connected")), btn));
    box.append(
      this.row(
        t("Ask on the island"),
        this.segmented(s.claudeCode.ask ? "on" : "off", [["on", t("On")], ["off", t("Off")]], (v) => this.change({ claudeCode: { ask: v === "on" } })),
      ),
    );
    if (this.ccError) box.append(el("p", "set-note error", this.ccError));
    if (this.cc && !this.cc.listening) box.append(el("p", "set-note error", t("Manga could not open its port for Claude Code ({port}). Is another Manga open?", { port: 31437 })));
    box.append(el("p", "set-note", t("Manga adds its hooks to Claude Code's settings ({path}), leaving yours as they are. With Manga closed, Claude Code asks in the terminal as always.", { path: this.cc?.path || "~/.claude/settings.json" })));
    body.append(box);

    const list = el("div", "set-box");
    list.append(el("div", "set-title", t("Sessions")));
    const sessions = this.sessions();
    if (!sessions.length) list.append(el("p", "set-note", t("No sessions now.")));
    const now = Date.now();
    for (const x of sessions) {
      const item = el("div", "notice-row");
      const text = el("div", "notice-text");
      text.append(el("b", "", x.project), el("span", "", x.state === "waiting" ? t("Waiting for you") : x.doing));
      const meta = el("div", "notice-meta");
      meta.append(el("span", `cc-dot ${x.state}`), el("span", "", ago(x.at, now, language())));
      item.append(text, meta);
      list.append(item);
    }
    body.append(list);
  }

  private notifications(body: HTMLElement) {
    const s = this.settings();
    const n = s.notifications;
    const setN = (p: Partial<typeof n>) => this.change({ notifications: { ...n, ...p } });
    const box = el("div", "set-box");
    box.append(
      this.row(t("Show Windows notifications"), this.segmented(n.on ? "on" : "off", [["on", t("On")], ["off", t("Off")]], (v) => setN({ on: v === "on" }))),
      this.row(
        t("On screen for"),
        this.segmented(String(n.seconds), [["4", "4 s"], ["6", "6 s"], ["10", "10 s"], ["20", "20 s"]], (v) => setN({ seconds: Number(v) })),
      ),
    );
    if (n.ignored.length) {
      const chips = el("div", "set-chips");
      for (const app of n.ignored) {
        const c = el("button", "chip on", `${app} ×`);
        c.title = t("Show again");
        c.addEventListener("click", (e) => {
          e.stopPropagation();
          setN({ ignored: n.ignored.filter((a) => a !== app) });
          this.paint();
        });
        chips.append(c);
      }
      box.append(this.row(t("Hidden apps"), chips));
    }
    body.append(box);

    const list = el("div", "set-box");
    list.append(el("div", "set-title", t("Recent")));
    const recent = this.recent();
    if (!recent.length) list.append(el("p", "set-note", t("No notifications yet.")));
    const now = Date.now();
    for (const r of recent) {
      const item = el("div", "notice-row");
      const text = el("div", "notice-text");
      text.append(el("b", "", r.title || r.app), el("span", "", r.body));
      const meta = el("div", "notice-meta");
      meta.append(el("span", "", `${r.app} · ${ago(r.at, now, language())}`));
      if (!n.ignored.includes(r.app)) {
        const hide = el("button", "set-btn quiet", t("Hide app"));
        hide.addEventListener("click", (e) => {
          e.stopPropagation();
          setN({ ignored: [...n.ignored, r.app] });
          this.paint();
        });
        meta.append(hide);
      }
      item.append(text, meta);
      list.append(item);
    }
    body.append(list);
  }

  /** Toggle chips that keep the order they were picked in (numbered). */
  private picker<T extends string>(all: { id: T; name: string }[], chosen: T[], max: number, set: (v: T[]) => void) {
    const box = el("div", "set-chips");
    for (const o of all) {
      const n = chosen.indexOf(o.id);
      const b = el("button", `chip${n >= 0 ? " on" : ""}`, n >= 0 && max > 1 ? `${n + 1}. ${o.name}` : o.name);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (n >= 0) set(chosen.filter((x) => x !== o.id));
        else if (chosen.length < max) set([...chosen, o.id]);
        this.paint();
      });
      box.append(b);
    }
    return box;
  }

  private island(body: HTMLElement) {
    const s = this.settings();
    const i = s.island;
    const setI = (p: Partial<typeof i>) => this.change({ island: { ...i, ...p } });
    const items = this.items.get();
    const built = ITEMS.filter((x) => x.phase <= BUILT_PHASE);

    const look = el("div", "set-box");
    look.append(el("div", "set-title", t("Island")));
    const scale = el("input", "set-range");
    scale.type = "range";
    scale.min = "0.8";
    scale.max = "1.4";
    scale.step = "0.05";
    scale.value = String(i.scale);
    scale.addEventListener("change", () => setI({ scale: Number(scale.value) }));
    look.append(
      this.row(t("Shape"), this.segmented(i.shape, [["notch", t("Notch")], ["floating", t("Floating")]], (shape) => setI({ shape }))),
      this.row(
        t("At rest"),
        this.segmented(i.rest, [["small", t("Small")], ["medium", t("Medium")], ["bar", t("Bar")], ["wide", t("Wide bar")]], (rest) => setI({ rest })),
      ),
      this.row(t("Size"), scale),
    );
    body.append(look);

    const small = el("div", "set-box");
    small.append(el("div", "set-title", t("Small island")));
    small.append(
      this.row(t("In the middle"), this.segmented(i.center, [["clock", t("Clock")], ["datetime", t("Day and time")], ["eyes", t("Manga's eyes")]], (center) => setI({ center }))),
      this.row(t("Each side (2 at most)"), this.picker(built.filter((x) => x.id !== "clock").map((x) => ({ id: x.id, name: t(x.name) })), items.small, 2, (small) => this.items.set({ ...items, small: small as ItemId[] }))),
      el("p", "set-note", t("What is going on takes a side for a while: the cover of a song, a download, a countdown.")),
    );
    body.append(small);

    const medium = el("div", "set-box");
    medium.append(el("div", "set-title", t("Medium island and bars")));
    medium.append(this.picker(built.map((x) => ({ id: x.id, name: t(x.name) })), items.medium, 10, (m) => this.items.set({ ...items, medium: m as ItemId[] })));
    medium.append(el("p", "set-note", t("In the order you pick them. The bars also show the tools below.")));
    body.append(medium);

    const open = el("div", "set-box");
    open.append(el("div", "set-title", t("Open island: the dock's tabs")));
    const names: Record<string, string> = { desk: "Windows", home: "Home", assistant: "Assistant", media: "Media", focus: "Focus", controls: "Controls", system: "System", tools: "Utilities", notes: "Notes", today: "Today" };
    open.append(this.picker(DOCK_PAGES.map((p) => ({ id: p, name: t(names[p]) })), i.dock, 9, (dock) => setI({ dock: dock as Page[] })));
    body.append(open);
  }

}
