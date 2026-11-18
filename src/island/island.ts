// The island on screen, shaped like a MacBook's notch by default: glued to
// the top, its two ears curving into the screen's edge.
// - small: the time (or Manga's eyes) with an item each side, which give way
//   to what is going on (a song, a download, a countdown);
// - medium: a header — the date on the left, Manga's eyes in the middle, the
//   time on the right — with the items of the bar;
// - bar and wide: the header wider, with the tools' icons;
// - extended: the same header, a page, and the dock of pages at the bottom.
// A Windows notification drops in as a banner below the header for a few
// seconds. It follows the state machine (core/island-state.ts) and sizes its
// window through Rust.

import { ChatView } from "../assistant/chat-view.ts";
import { AskView } from "../claude-code/ask-view.ts";
import { ControlsView } from "../controls/controls-view.ts";
import { bars, positionNow, subtitle, type Media } from "../media/media.ts";
import { MediaView } from "../media/media-view.ts";
import { apply, project, type CcAsk, type CcEvent, type Session } from "../claude-code/sessions.ts";
import { Bridge, IN_APP, on } from "../core/bridge.ts";
import { borderRadius, earSize, islandBox, windowSize, type Box } from "../core/geometry.ts";
import { INITIAL, next, type IslandEvent, type IslandState, type Page } from "../core/island-state.ts";
import { language, t } from "../core/i18n.ts";
import type { Settings } from "../core/settings.ts";
import { itemView, type ItemContext, type ItemPrefs } from "../items/registry.ts";
import { Kumo, drawGlowEyes } from "../mascot/kumo.ts";
import { Banner } from "../notify/banner.ts";
import { InboxView } from "../notify/inbox-view.ts";
import { remember, shows, type Notice } from "../notify/notices.ts";
import { lockChange, merge, percent, progressText, type Download, type Locks, type Shot } from "../system/activity.ts";
import { Hud } from "../system/hud.ts";
import { FocusEngine, phaseName, type Ring } from "../focus/engine.ts";
import { FocusView } from "../focus/focus-view.ts";
import { clock as focusClock, shown as focusShown } from "../focus/timer.ts";
import { playTone } from "../focus/tones.ts";
import { I } from "./icons.ts";
import { background, inkOn } from "../core/look.ts";
import { Speaker } from "../voice/speaker.ts";
import { STATIONS } from "../focus/lofi.ts";
import { dayContext } from "../assistant/context.ts";
import type { Action } from "../assistant/actions.ts";
import { remark, restMood } from "../mascot/reactions.ts";
import { progress as focusProgress } from "../focus/timer.ts";
import { SettingsView } from "../settings/settings-view.ts";
import { SystemView } from "../sysinfo/system-view.ts";
import { ToolsView } from "../tools/tools-view.ts";
import { DayStore } from "../day/store.ts";
import { TodayView, when } from "../day/today-view.ts";
import { NotesView } from "../day/notes-view.ts";
import { sky } from "../day/weather.ts";
import { DeskView } from "../desk/desk-view.ts";
import { addToShelf, nextLayout, sanitizeShelf, type ShelfItem } from "../desk/shelf.ts";
import type { AppWindow, Keyboard } from "../core/bridge.ts";
import { Canvas, el, icon } from "./dom.ts";

function loadJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage off */
  }
}

const appIcons = new Map<string, string | null>();

/** An app's icon from its program, fetched once. */
function appIcon(exe: string, fallback: string): HTMLElement {
  const e = el("span", "head-app-icon", fallback);
  const known = appIcons.get(exe);
  if (known) {
    e.textContent = "";
    e.style.backgroundImage = `url("${known}")`;
  } else if (known === undefined && exe && IN_APP) {
    appIcons.set(exe, null);
    void Bridge.fileIcon(exe).then((src) => appIcons.set(exe, src));
  }
  return e;
}

export interface Look {
  /** The island's colour (a solid or translucent colour, so the ears match). */
  color: string;
  /** An optional gradient laid over it (the ears keep `color`). */
  tint: string | null;
  glow: boolean;
}

// Stroke icons (24×24) for the dock.
const ICON: Record<Page, string> = {
  home: "M4 11.5 12 5l8 6.5V20h-5.5v-5h-5v5H4z",
  assistant: "M7 5h10a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4h-5l-4.5 3v-3.2A4 4 0 0 1 3 13V9a4 4 0 0 1 4-4z",
  media: "M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  focus: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 2M10 2.5h4",
  controls: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  notes: "M6 3.5h9l3.5 3.5v13.5H6zM9 10h6M9 13.5h6M9 17h4",
  inbox: "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  system: "M4 5h16v11H4zM9 20h6M12 16v4M7 12l2.5-3 2.5 2 3-4 2 2",
  tools: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7",
  today: "M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4M8 13.5h2M14 13.5h2M8 17h2",
  desk: "M4 5.5l7-1v7H4zM13 4.2l7-1v8.3h-7zM4 12.5h7v7l-7-1zM13 12.5h7v8.3l-7-1z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-2 1.2L14.8 21h-4l-.3-2.4a7 7 0 0 1-2-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-2.4L4.6 9.9l2-3.4 1.9.7a7 7 0 0 1 2-1.2l.3-2.4h4l.3 2.4a7 7 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 2.4z",
};

const PAGES: { id: Page; label: string; phase: number }[] = [
  { id: "home", label: "Home", phase: 1 },
  { id: "assistant", label: "Assistant", phase: 2 },
  { id: "media", label: "Media", phase: 3 },
  { id: "focus", label: "Focus", phase: 4 },
  { id: "controls", label: "Controls", phase: 3 },
  { id: "desk", label: "Windows", phase: 6 },
  { id: "system", label: "System", phase: 4 },
  { id: "tools", label: "Utilities", phase: 4 },
  { id: "today", label: "Today", phase: 5 },
  { id: "notes", label: "Notes", phase: 5 },
  { id: "settings", label: "Settings", phase: 2 },
  { id: "inbox", label: "Notifications", phase: 2 },
];

/** The banner's size, unscaled. */
const NOTICE_HEIGHT = 84;
const NOTICE_WIDTH = 440;
/** Claude Code waiting: the panel's width, unscaled. */
const ASK_WIDTH = 560;
const HEAD = 36;

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

export class Island {
  state: IslandState = INITIAL;
  look: Look = { color: "#000", tint: null, glow: false };
  items: ItemPrefs;
  readonly kumo = new Kumo();

  private shell = el("div");
  private clip = el("div", "clip");
  private earL = el("span", "ear left");
  private earR = el("span", "ear right");
  // Small: the eyes alone.
  private eyesBig = new Canvas(64, 32, "eyes-big", (x) => drawGlowEyes(x, this.kumo, 64, 32, 14));
  // Medium and extended: the header.
  private headLeft = el("span", "head-left");
  private headRight = el("span", "head-right");
  private headItems = el("span", "head-items");
  private menu = el("button", "head-menu", "···");
  // A notification.
  private banner: Banner;
  private inbox: InboxView;
  private hud = new Hud(() => this.render());
  private locks: Locks = { caps: false, num: false, scroll: false };
  private downloads: Download[] = [];
  private downloadsDir = "";
  private bell = el("button", "head-bell");
  private countBadge = el("span", "count-badge");
  private capsSmall = el("span", "caps-small", "A");
  private ring = el("span", "dl-ring");
  private smallFace = el("div", "small-face");
  private slotL = el("span", "slot slot-l");
  private slotR = el("span", "slot slot-r");
  private smallCenter = el("span", "small-center");
  private headTools = el("span", "head-tools");
  private homeFace = new Canvas(150, 150, "home-manga", (x) => this.kumo.draw(x, 150, 150, 92));
  private sys: ItemContext["sys"] = null;
  private liveOn = false;
  readonly speaker: Speaker;
  private focusLine = el("span", "focus-line");
  /** While focusing (focus mode), notifications wait for the break. */
  private focusQuiet = false;
  private heldDuringFocus = 0;
  private lastRestMood: string = "idle";
  private systemView = new SystemView((s) => {
    this.sys = s;
  });
  private toolsView: ToolsView;
  readonly day: DayStore;
  private todayView: TodayView;
  private notesView: NotesView;
  private deskView: DeskView;
  private shelf: ShelfItem[] = sanitizeShelf(loadJson("manga.shelf"));
  private keyboard: Keyboard | null = null;
  private openApps: AppWindow[] = [];
  private bin: number | undefined;
  private liveRect = "";
  readonly focus: FocusEngine;
  private focusView: FocusView;
  private countdown = el("span", "countdown");
  private ringFace = new Canvas(64, 64, "hud-kumo", (x) => this.kumo.draw(x, 64, 64, 40));
  private audio: AudioContext | null = null;
  private ringing: number | null = null;
  private restShown = 0;
  private recent: Notice[] = [];
  private unread = 0;
  private battery: ItemContext["battery"] = null;
  // Extended: the page and the dock.
  private page = el("div", "page");
  private dock = el("div", "dock");
  private dockLabel = el("span", "dock-label");
  private chat: ChatView;
  private settingsView: SettingsView;
  private foldTimer: number | null = null;
  private hoverTimer: number | null = null;
  private fullscreen = false;
  /** What holds the island open: the pin, a text field in use. */
  private holds = new Set<string>();
  private ask: AskView;
  private media: Media | null = null;
  private mediaReadAt = 0;
  private level = 0;
  private mediaView: MediaView;
  private controlsView: ControlsView;
  private miniCover = el("span", "mini-cover");
  private wavesSmall = new Canvas(22, 16, "mini-waves", (x) => this.drawWaves(x, 22, 16, 4));
  private wavesHead = new Canvas(20, 14, "head-waves", (x) => this.drawWaves(x, 20, 14, 4));
  private sessions: Session[] = [];
  private shownPage: Page | null = null;

  constructor(
    root: HTMLElement,
    items: ItemPrefs,
    private settings: Settings,
    private save: (s: Settings) => void,
    private saveItems: (i: ItemPrefs) => void = () => {},
  ) {
    this.items = items;
    this.shell.id = "island";
    this.state = { ...INITIAL, rest: settings.island.rest, size: settings.island.rest };

    const hold = (why: string) => (onIt: boolean) => this.hold(why, onIt);
    const change = (p: Partial<Settings>) => this.change(p);
    this.speaker = new Speaker(() => this.settings.voice, this.kumo);
    this.chat = new ChatView(this.kumo, () => this.settings, change, hold("chat"), {
      context: () => this.dayContext(),
      act: (a) => this.runAction(a),
      say: (text) => {
        if (this.settings.voice.replies) void this.speaker.say(text);
      },
    });
    this.ask = new AskView(() => this.render(), hold("ask"));
    this.mediaView = new MediaView(() => ({ m: this.media, readAt: this.mediaReadAt }));
    this.controlsView = new ControlsView(
      () => this.settings.notifications.quiet,
      (quiet) => this.change({ notifications: { ...this.settings.notifications, quiet } }),
      hold("controls"),
      () => this.settings.controls,
      (controls) => this.change({ controls }),
    );
    this.settingsView = new SettingsView(() => this.settings, change, () => this.recent, () => this.sessions, hold("settings"), {
      get: () => this.items,
      set: (i) => {
        this.items = i;
        this.saveItems(i);
        this.render();
      },
    });
    this.focus = new FocusEngine(
      () => this.settings.focus,
      (r) => this.ringAlarm(r),
      (open, phase, endsAt) => this.rest(open, phase === "long", endsAt),
      root,
    );
    this.focusView = new FocusView(
      this.focus,
      () => this.settings.focus.musicVolume,
      (v) => {
        this.focus.setMusicVolume(v);
        this.change({ focus: { ...this.settings.focus, musicVolume: v } });
      },
      hold("focus"),
      (p) => this.change({ focus: { ...this.settings.focus, prefs: { ...this.settings.focus.prefs, ...p } } }),
      () => this.day.tasks.filter((x) => !x.done).map((x) => ({ id: x.id, text: x.text })),
    );
    this.focus.onChange(() => {
      if (this.shownPage === "home") this.shownPage = null;
      this.render();
    });
    this.hud.ringFace = this.ringFace.el;
    on<{ action: string }>("alert-action", (a) => {
      this.stopRinging();
      this.focus.act(a.action);
    });
    on<{ action: string }>("rest-action", () => {
      this.restShown = 0;
      this.focus.skip();
    });
    this.day = new DayStore(
      () => this.settings.day,
      () => {
        const w = this.day.waterNow;
        this.kumo.flash("happy", 2);
        if (this.settings.voice.alerts) void this.speaker.say(t("Time for some water!"));
        this.hud.show({
          kind: "water",
          text: t("{ml} ml of {goal} ml today.", { ml: w.ml, goal: this.settings.day.water.goal }),
          drink: () => {
            this.day.drink();
            this.kumo.flash("love", 1.6);
          },
        });
      },
    );
    this.todayView = new TodayView(
      this.day,
      () => this.settings.day.place?.name ?? "",
      () => {
        this.settingsView.tab = "day";
        this.dispatch({ type: "open", page: "settings" });
      },
      () => {
        this.notesView.tab = "tasks";
        this.dispatch({ type: "open", page: "notes" });
      },
      hold("today"),
    );
    this.notesView = new NotesView(this.day, hold("notes"));
    this.day.onChange(() => {
      if (this.shownPage === "home") this.shownPage = null;
      this.renderHead();
    });
    this.deskView = new DeskView(
      () => this.shelf,
      (s) => {
        this.shelf = s;
        saveJson("manga.shelf", s);
      },
      () => this.settings.clipboard,
      (clipboard) => {
        this.change({ clipboard });
        void Bridge.clipboardWatch(clipboard);
      },
    );
    void Bridge.clipboardWatch(settings.clipboard);
    on("clipboard", () => void this.deskView.clipboardChanged());
    on<Keyboard>("keyboard", (k) => {
      const before = this.keyboard?.current;
      this.keyboard = k;
      const now = k.layouts.find((l) => l.id === k.current);
      if (before != null && before !== k.current && now) this.hud.show({ kind: "keyboard", short: now.short, name: now.name });
      else this.renderHead();
    });
    void Bridge.keyboardGet().then((k) => (this.keyboard = k));
    // The bar's taskbar and Recycle Bin items read Windows every few seconds.
    window.setInterval(() => {
      const items = this.items.medium;
      if (this.state.size === "small") return;
      if (items.includes("taskbar")) void Bridge.appsOpen().then((a) => ((this.openApps = a ?? []), this.renderHead()));
      if (items.includes("recycle")) void Bridge.winState().then((w) => ((this.bin = w?.binItems), this.renderHead()));
    }, 4000);
    this.listenDrops();
    this.focus.hooks = {
      taskName: (id) => this.day.tasks.find((x) => x.id === id)?.text ?? null,
      taskDone: (id) => {
        if (this.day.tasks.some((x) => x.id === id && !x.done)) this.day.toggleTask(id);
      },
      focusing: (on) => this.focusMode(on),
    };
    window.setInterval(() => void this.react(), 30_000);
    window.setTimeout(() => void this.react(), 3000);
    // Full screen: the island steps aside (if the user wants it so).
    on<boolean>("fullscreen", (full) => {
      this.fullscreen = full;
      void Bridge.islandVisible(!(full && this.settings.look.fullscreen === "hide"));
    });
    void Bridge.islandMonitor(settings.look.monitor);
    // A new version, looked for once a day (after a minute, not to slow the start).
    window.setTimeout(() => void this.lookForUpdate(), 60_000);
    window.setInterval(() => void this.lookForUpdate(), 6 * 3600_000);
    this.applyLook();
    this.toolsView = new ToolsView(
      () => this.settings.tools,
      (tools) => this.change({ tools }),
      hold("tools"),
    );
    // The bar's CPU, memory and network items read the PC every few seconds.
    window.setInterval(() => {
      const wants = this.items.medium.concat(this.items.small).some((i) => i === "cpu" || i === "ram" || i === "net");
      if (wants && this.shownPage !== "system" && this.state.size !== "small") void this.systemView.read().then(() => this.renderHead());
    }, 3000);
    this.settingsView.speaker = this.speaker;
    this.banner = new Banner(
      this.kumo,
      () => this.settings.notifications.seconds,
      () => this.render(),
      () => this.dispatch({ type: "open", page: "inbox" }),
    );
    this.inbox = new InboxView(
      () => this.recent,
      (id) => {
        this.recent = id == null ? [] : this.recent.filter((n) => n.id !== id);
        this.inbox.paint();
        this.renderHead();
      },
      (app) => {
        const n = this.settings.notifications;
        if (!n.ignored.includes(app)) this.change({ notifications: { ...n, ignored: [...n.ignored, app] } });
        this.recent = this.recent.filter((x) => x.app !== app);
        this.inbox.paint();
      },
    );
    this.bell.append(icon(I.bell, 14));
    this.bell.title = t("Notifications");
    this.bell.addEventListener("click", (e) => {
      e.stopPropagation();
      this.dispatch({ type: "open", page: "inbox" });
    });

    const middle = el("span", "small-mid");
    middle.append(this.smallCenter, this.countBadge);
    this.smallFace.append(this.slotL, middle, this.slotR);

    const head = el("div", "head");
    const center = el("span", "head-center");
    const right = el("span", "head-right-box");
    right.append(this.headItems, this.headRight, this.menu);
    const left = el("span", "head-left-box");
    left.append(this.headLeft, this.headTools);
    head.append(left, center, right);
    this.menu.title = t("Pin the island open");
    this.menu.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hold("pin", !this.holds.has("pin"));
    });

    this.renderDock();

    const body = el("div", "body");
    body.append(this.page, this.dock);
    this.clip.append(this.smallFace, head, this.banner.el, body, this.hud.el, this.ask.el);
    this.shell.append(this.earL, this.earR, this.clip);
    this.clip.append(this.focusLine);
    root.append(this.shell);

    this.shell.addEventListener("mouseenter", () => {
      if (this.foldTimer != null) window.clearTimeout(this.foldTimer);
      this.dispatch({ type: "enter" });
      // Opening on hover: after a short rest, so passing by does not open it.
      if (this.settings.look.open === "hover" && this.state.size !== "extended") {
        if (this.hoverTimer != null) window.clearTimeout(this.hoverTimer);
        this.hoverTimer = window.setTimeout(() => {
          if (this.state.pointerInside) this.dispatch({ type: "click" });
        }, 350);
      }
    });
    this.shell.addEventListener("mouseleave", () => {
      if (this.hoverTimer != null) window.clearTimeout(this.hoverTimer);
      this.dispatch({ type: "leave" });
      if (this.foldTimer != null) window.clearTimeout(this.foldTimer);
      this.foldTimer = window.setTimeout(() => this.dispatch({ type: "fold" }), this.settings.look.fold * 1000);
    });
    this.shell.addEventListener("click", () => {
      if (this.state.size !== "extended") this.kumo.flash("happy", 1.2);
      this.dispatch({ type: "click" });
    });
    this.shell.addEventListener("mousemove", (e) => {
      const r = this.shell.getBoundingClientRect();
      this.kumo.lookX = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width / 2)));
      this.kumo.lookY = Math.max(-1, Math.min(1, (e.clientY - r.top - 16) / 40));
    });

    on<Notice>("notification", (n) => this.notify(n));
    on<Locks>("locks", (l) => this.setLocks(l));
    on<Shot>("screenshot", (x) => this.screenshot(x));
    on<Download[]>("download", (d) => this.download(d));
    void Bridge.locksGet().then((l) => l && (this.locks = l) && this.render());
    void Bridge.downloadsFolder().then((d) => (this.downloadsDir = d ?? ""));
    on<Media | null>("media", (m) => this.setMedia(m));
    window.setInterval(() => void this.listen(), 80);
    on<CcEvent>("cc-event", (e) => this.claudeCode(e));
    on<CcAsk>("cc-ask", (a) => this.claudeAsks(a));
    on<number>("cc-ask-gone", (id) => this.ask.gone(id));
    void Bridge.notificationsWatch(settings.notifications.on);
    void this.watchBattery();

    this.render();
    this.loop();
  }

  /** The dock and the bars' tools: the pages the user picked, settings last. */
  private renderDock() {
    const button = (id: Page, size: number, cls: string) => {
      const p = PAGES.find((x) => x.id === id)!;
      const b = el("button", cls);
      b.dataset.page = id;
      b.title = t(p.label);
      b.append(icon(ICON[id], size));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.dispatch({ type: "open", page: id });
      });
      return b;
    };
    const pages = this.settings.island.dock;
    this.dock.replaceChildren(...pages.map((id) => button(id, 17, "dock-btn")), this.dockLabel);
    const gear = button("settings", 17, "dock-btn end");
    this.dock.append(gear);
    this.headTools.replaceChildren(...pages.map((id) => button(id, 15, "tool-btn")), button("settings", 15, "tool-btn"));
  }

  /** What the items read: the battery, the count, the PC, the day. */
  private itemContext(): ItemContext {
    const w = this.day?.weather;
    const next = this.day?.upcoming(2, 1)[0];
    const water = this.day?.waterNow;
    return {
      battery: this.battery,
      unread: this.unread,
      sys: this.sys,
      bin: this.bin,
      day: {
        temp: w?.temp,
        icon: w ? sky(w.code, w.isDay).icon : undefined,
        next: next ? `${when(next)} ${next.title}`.slice(0, 40) : undefined,
        ml: water?.ml,
        goal: this.settings.day.water.on ? this.settings.day.water.goal : undefined,
      },
    };
  }

  /** The small island: its middle, and what each side shows now. */
  private renderSmall() {
    const s = this.settings.island;
    const now = new Date();
    const time = now.toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" });
    if (s.center === "eyes") {
      if (this.smallCenter.firstChild !== this.eyesBig.el) this.smallCenter.replaceChildren(this.eyesBig.el);
    } else {
      const day = now.toLocaleDateString(language(), { weekday: "short", day: "numeric" }).replace(/\./g, "").toUpperCase();
      this.smallCenter.textContent = s.center === "datetime" ? `${day}  ${time}` : time;
    }
    this.smallCenter.className = `small-center c-${s.center}`;
    if (this.state.size !== "small") return;
    const ctx = this.itemContext();
    const item = (i: number): Node | null => {
      const id = this.items.small[i];
      if (!id || id === "notifications") return null;
      if (id === "countdown") return this.focus.state.running ? this.countdown : null;
      if (id === "waves") return this.media?.playing ? this.wavesSmall.el : null;
      const v = itemView(id, now, ctx);
      return v ? el("span", `slot-item item-${id}`, v.text) : null;
    };
    const left = this.media?.playing && this.media.cover ? this.miniCover : this.locks.caps ? this.capsSmall : item(0);
    const right = this.shownDownload() ? this.ring : this.focus.state.running ? this.countdown : this.media?.playing ? this.wavesSmall.el : item(1);
    this.slotL.replaceChildren(...(left ? [left] : []));
    this.slotR.replaceChildren(...(right ? [right] : []));
    // The count by the time only when the user wants notifications there.
    this.countBadge.hidden = !this.items.small.includes("notifications");
  }

  private async lookForUpdate() {
    if (!this.settings.updates || !IN_APP) return;
    let last = 0;
    try {
      last = Number(localStorage.getItem("manga.updateCheckedAt")) || 0;
      if (Date.now() - last < 24 * 3600_000) return;
      localStorage.setItem("manga.updateCheckedAt", String(Date.now()));
    } catch {
      /* storage off */
    }
    const r = await Bridge.updateCheck();
    if ("ok" in r && r.ok) {
      this.kumo.flash("proud", 2);
      this.notify({ id: -Date.now(), app: "Manga", title: t("Manga {v} is out!", { v: r.ok.version }), body: t("Settings → About to install."), at: Date.now() });
    }
  }

  /** The day in a few lines, for the AI (only when the person lets Manga share it). */
  private dayContext(): string {
    const w = this.day.weather;
    const f = this.focus.state;
    const task = this.focus.task ? this.day.tasks.find((x) => x.id === this.focus.task)?.text ?? null : null;
    return dayContext({
      now: new Date(),
      lang: language(),
      weather: w && this.settings.day.place ? { temp: w.temp, sky: t(sky(w.code, w.isDay).label), place: this.settings.day.place.name } : null,
      events: this.day.upcoming(3, 6).map((o) => ({ title: o.title, when: when(o) })),
      tasks: this.day.tasks.filter((x) => !x.done).map((x) => ({ text: x.text, due: x.due })),
      focus: { phase: phaseName(f.phase), running: f.running, left: focusClock(focusShown(f, Date.now())), task },
      water: this.settings.day.water.on ? { ml: this.day.waterNow.ml, goal: this.settings.day.water.goal } : null,
      playing: this.media ? { title: this.media.title, app: this.media.app } : null,
      unread: this.unread,
      lastNotices: this.recent.slice(0, 3).map((n) => ({ app: n.app, title: n.title })),
    });
  }

  /** Does what Manga was asked in the chat; answers what was done, for the chat to show. */
  private runAction(a: Action): string | null {
    switch (a.kind) {
      case "task":
        this.day.addTask(a.text, a.date);
        return t("Task added: {text}", { text: a.text });
      case "pomodoro":
        if (a.minutes) this.change({ focus: { ...this.settings.focus, prefs: { ...this.settings.focus.prefs, focus: a.minutes } } });
        this.focus.setMode("pomodoro");
        if (!this.focus.state.running) this.focus.toggle();
        return t("Focus started");
      case "timer":
        this.focus.timer(a.minutes);
        return t("Timer of {n} min started", { n: a.minutes });
      case "alarm":
      case "reminder":
        this.focus.addAlarm({ id: String(Date.now()), time: a.time, days: [], label: a.kind === "alarm" ? a.label : a.text, tone: this.settings.focus.tone, on: true });
        return a.kind === "alarm" ? t("Alarm at {time}", { time: a.time }) : t("Reminder at {time}", { time: a.time });
      case "music":
        if (a.station === "stop") {
          this.focus.stopMusic();
          return t("Music stopped");
        }
        this.focus.playMusic({ kind: "station", id: a.station });
        return t("Playing {name}", { name: t(STATIONS.find((x) => x.id === a.station)?.name ?? a.station) });
      case "note": {
        const n = this.day.addNote();
        this.day.editNote(n.id, a.text);
        return t("Note saved");
      }
      case "water":
        this.day.drink();
        return t("A glass of water counted");
      case "open":
        this.dispatch({ type: "open", page: a.page });
        return null;
    }
  }

  /** Focus mode: notifications wait for the break; distracting apps are minimized. */
  private focusMode(on: boolean) {
    const f = this.settings.focus;
    if (on) {
      this.focusQuiet = f.quiet;
      this.heldDuringFocus = 0;
      if (f.minimize.length) {
        const want = f.minimize.map((x) => x.toLowerCase());
        void Bridge.appsOpen().then((apps) => {
          for (const a of apps ?? []) if (want.some((w) => a.app.toLowerCase().includes(w) || a.title.toLowerCase().includes(w))) void Bridge.appWindow(a.id, "minimize");
        });
      }
      return;
    }
    this.focusQuiet = false;
    if (this.heldDuringFocus > 0) {
      const n = this.heldDuringFocus;
      this.heldDuringFocus = 0;
      this.notify({ id: -Date.now(), app: "Manga", title: t("While you focused"), body: t("{n} notifications are waiting in the list.", { n }), at: Date.now() });
    }
  }

  /** Manga's mood follows what goes on; now and then he says something about it. */
  private async react() {
    if (this.chatBusy()) return;
    if (IN_APP && !this.sys) this.sys = (await Bridge.sysinfo()) ?? null;
    const w = this.day.waterNow;
    const goal = this.settings.day.water;
    const f = this.focus.state;
    const mood = restMood({
      hour: new Date().getHours(),
      battery: this.battery ? this.battery.level : null,
      charging: this.battery?.charging ?? false,
      cpu: this.sys ? this.sys.cpu : null,
      focusing: f.running && f.phase === "focus",
      onBreak: f.running && (f.phase === "short" || f.phase === "long"),
      goalReached: goal.on && w.ml >= goal.goal,
    });
    const line = remark(this.lastRestMood as never, mood);
    this.lastRestMood = mood;
    this.kumo.setMood(mood);
    if (line && this.settings.remarks) {
      this.hud.show({ kind: "say", text: line });
      if (this.settings.voice.alerts) void this.speaker.say(line);
    }
  }

  private chatBusy(): boolean {
    return ["thinking", "working", "happy", "sad", "surprised"].includes(this.kumo.mood) && this.state.page === "assistant" && this.state.size === "extended";
  }

  /** Files dragged over the island open the shelf; dropped, they stay there. */
  private listenDrops() {
    if (!IN_APP) return;
    void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) =>
      getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter") {
          this.deskView.tab = "shelf";
          if (this.shownPage === "desk") this.shownPage = null;
          this.dispatch({ type: "open", page: "desk" });
        } else if (p.type === "drop" && p.paths.length) {
          this.addToShelf(p.paths);
        }
      }),
    );
  }

  /** Files on the shelf (the page's console can call it too). */
  addToShelf(paths: string[]) {
    this.shelf = addToShelf(this.shelf, paths, Date.now());
    saveJson("manga.shelf", this.shelf);
    this.kumo.flash("happy", 1.4);
    this.deskView.tab = "shelf";
    if (this.shownPage === "desk") this.deskView.paint();
  }

  dispatch(e: IslandEvent) {
    const before = this.state;
    this.state = next(this.state, e);
    if (before !== this.state) this.render();
  }

  /** The user's look: the accent everywhere, the font, the island's colour. */
  private applyLook() {
    const l = this.settings.look;
    const root = document.documentElement.style;
    root.setProperty("--accent", l.accent);
    root.setProperty("--accent-ink", inkOn(l.accent));
    document.body.classList.toggle("font-sans", l.font === "sans");
    document.body.classList.toggle("light-island", inkOn(l.color) !== "#f5f3fa");
  }

  setLook(look: Partial<Look>) {
    this.look = { ...this.look, ...look };
    this.render();
  }

  /** Shows a Windows notification (the page's console can call it too). */
  notify(n: Notice) {
    const s = this.settings.notifications;
    if (!s.on || !shows(n, s.ignored)) return;
    this.recent = remember(this.recent, n);
    if (s.quiet || this.focusQuiet) {
      // Do not disturb (or focusing): in the list, quietly.
      this.unread++;
      if (this.focusQuiet) this.heldDuringFocus++;
      this.renderHead();
      return;
    }
    const reading = this.state.size === "extended" && this.state.page === "inbox";
    if (!reading) this.unread++;
    else this.inbox.paint();
    // Kumo announces it: a jump, a bang, the banner with his face.
    this.kumo.flash("alert", 2.2);
    if (this.state.size === "extended") {
      this.renderHead();
      return;
    }
    this.banner.push(n);
  }

  /** A lock key changed (the page's console can call it too). */
  setLocks(l: Locks) {
    const change = lockChange(this.locks, l);
    this.locks = l;
    if (change) {
      if (change.on) this.kumo.flash("surprised", 0.8);
      this.hud.show({ kind: "lock", ...change });
    } else this.render();
  }

  /** A new screenshot (the page's console can call it too). */
  screenshot(x: Shot) {
    this.kumo.flash("happy", 1.6);
    this.hud.show({ kind: "shot", shot: x });
  }

  /** Downloads' news (the page's console can call it too). */
  download(news: Download[]) {
    this.downloads = merge(this.downloads, news);
    for (const d of news) {
      if (d.state !== "done") continue;
      this.kumo.flash("proud", 2);
      this.hud.show({ kind: "done", download: d, folder: this.downloadsDir });
      // The finished one stays a moment, its ring full and green.
      window.setTimeout(() => {
        this.downloads = this.downloads.filter((x) => x.id !== d.id);
        this.render();
      }, 3000);
    }
    if (this.shownPage === "controls") this.controlsView.setDownloads(this.downloads);
    this.render();
  }

  /** A focus phase, a timer or an alarm ended: the card, the tone, Kumo. */
  private ringAlarm(r: Ring) {
    const f = this.settings.focus;
    this.kumo.flash(f.alert.mood, 4);
    if (this.settings.voice.alerts) window.setTimeout(() => void this.speaker.say(`${r.title} ${r.body}`), 1200);
    const data = { ...r, volume: f.volume, mood: f.alert.mood, color: f.alert.color, repeat: f.alert.repeat };
    if (IN_APP && f.alert.place !== "island") {
      void Bridge.popupOpen("alert", data, 460, 220, f.alert.place === "top" ? "top" : "center");
      return;
    }
    // On the island itself: the card in the notch, the tone from here.
    this.stopRinging();
    const play = () => {
      this.audio ??= new AudioContext();
      void this.audio.resume();
      playTone(this.audio, r.tone, f.volume);
    };
    play();
    let rings = 1;
    if (f.alert.repeat) this.ringing = window.setInterval(() => (++rings > 20 ? this.stopRinging() : play()), 3200);
    this.hud.show({
      kind: "ring",
      ring: r,
      color: f.alert.color,
      act: (id) => {
        this.stopRinging();
        this.focus.act(id);
      },
    });
  }

  private stopRinging() {
    if (this.ringing != null) window.clearInterval(this.ringing);
    this.ringing = null;
  }

  /** The rest screen while a break runs. */
  private rest(open: boolean, long: boolean, endsAt: number) {
    if (!IN_APP) return;
    if (open && this.restShown !== endsAt) {
      this.restShown = endsAt;
      void Bridge.popupOpen("rest", { endsAt, long, skip: this.settings.focus.restSkip }, 0, 0, "full");
    } else if (!open && this.restShown) {
      this.restShown = 0;
      void Bridge.popupClose("rest");
    }
  }

  /** The download the island shows: the newest still going, or one just done. */
  private shownDownload(): Download | null {
    return this.downloads.filter((d) => d.state === "downloading").at(-1) ?? this.downloads.at(-1) ?? null;
  }

  private paintRing() {
    const d = this.shownDownload();
    this.ring.replaceChildren();
    this.ring.classList.toggle("done", d?.state === "done");
    if (!d) return;
    const p = percent(d);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    const track = document.createElementNS(ns, "circle");
    const arc = document.createElementNS(ns, "circle");
    for (const c of [track, arc]) {
      c.setAttribute("cx", "10");
      c.setAttribute("cy", "10");
      c.setAttribute("r", "8");
      c.setAttribute("fill", "none");
      c.setAttribute("stroke-width", "2.6");
    }
    track.setAttribute("stroke", "rgba(255,255,255,0.18)");
    arc.setAttribute("stroke", d.state === "done" ? "#34c759" : "#7fd4ff");
    arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("transform", "rotate(-90 10 10)");
    const len = 2 * Math.PI * 8;
    arc.setAttribute("stroke-dasharray", `${len}`);
    arc.setAttribute("stroke-dashoffset", `${p == null ? len * 0.7 : len * (1 - p / 100)}`);
    if (p == null) arc.classList.add("spin");
    svg.append(track, arc);
    const label = d.state === "done" ? icon(I.check, 13) : el("span", "", p == null ? progressText(d, language()).split(" · ")[0] : `${p}%`);
    this.ring.append(svg, label);
    this.ring.title = `${d.name} — ${progressText(d, language())}`;
  }

  /** What plays now (the page's console can call it too). */
  setMedia(m: Media | null) {
    const before = this.media;
    this.media = m && m.title ? m : null;
    this.mediaReadAt = Date.now();
    const same = before && this.media && before.title === this.media.title && before.playing === this.media.playing && before.cover === this.media.cover;
    if (this.shownPage === "media" && !same) this.mediaView.paint();
    if (this.shownPage === "home" && !same) this.shownPage = null;
    if (!same) this.render();
  }

  /** How loud it plays, for the waves (only while something plays). */
  private async listen() {
    if (!this.media?.playing) {
      this.level *= 0.8;
      return;
    }
    const raw = IN_APP ? ((await Bridge.soundLevel()) ?? 0) : 0.45 + 0.35 * Math.abs(Math.sin(Date.now() / 900));
    this.level = this.level * 0.5 + raw * 0.5;
  }

  private drawWaves(x: CanvasRenderingContext2D, w: number, h: number, n: number) {
    const b = bars(this.level, Date.now() / 1000, n);
    const gap = 2;
    const bw = (w - gap * (n - 1)) / n;
    x.fillStyle = "#ffd9b3";
    b.forEach((v, i) => {
      const bh = Math.max(2, v * h);
      x.beginPath();
      x.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, bw / 2);
      x.fill();
    });
  }

  /** News from Claude Code (the page's console can call it too). */
  claudeCode(e: CcEvent) {
    const before = this.sessions.find((x) => x.id === e.session);
    this.sessions = apply(this.sessions, e, Date.now());
    const after = this.sessions.find((x) => x.id === e.session);
    const name = project(e.cwd);
    if (e.event === "Notification" && e.message) {
      this.notify({ id: -Date.now(), app: "Claude Code", title: name, body: e.message, at: Date.now() });
    } else if (e.event === "Stop" && before?.state === "working") {
      this.notify({ id: -Date.now(), app: "Claude Code", title: name, body: t("Finished"), at: Date.now() });
      this.kumo.flash("proud", 2);
    }
    const working = this.sessions.some((x) => x.state === "working");
    if (working && this.kumo.mood === "idle") this.kumo.setMood("working");
    if (!working && this.kumo.mood === "working" && after?.state !== "working") this.kumo.setMood("idle");
    if (this.shownPage === "home" || this.shownPage === "settings") this.shownPage = null;
    this.render();
  }

  /** Claude Code waits for the user (the page's console can call it too). */
  claudeAsks(a: CcAsk) {
    if (!this.settings.claudeCode.ask) {
      void Bridge.ccAnswer(a.id, { choice: "terminal" });
      return;
    }
    this.claudeCode(a);
    this.kumo.flash(a.kind === "question" ? "question" : "alert", 2);
    this.ask.add(a);
  }

  private hold(why: string, onIt: boolean) {
    if (onIt) this.holds.add(why);
    else this.holds.delete(why);
    if (why !== "pin") void Bridge.focus(onIt);
    this.dispatch({ type: "hold", on: this.holds.size > 0 });
    this.menu.classList.toggle("on", this.holds.has("pin"));
  }

  private change(p: Partial<Settings>) {
    const before = this.settings;
    this.settings = { ...before, ...p };
    this.save(this.settings);
    if (p.notifications && p.notifications.on !== before.notifications.on) void Bridge.notificationsWatch(p.notifications.on);
    if (p.focus) this.focus.prefsChanged();
    if (p.look) {
      this.applyLook();
      if (p.look.monitor !== before.look.monitor) void Bridge.islandMonitor(p.look.monitor);
      if (p.look.fullscreen !== before.look.fullscreen) void Bridge.islandVisible(!(this.fullscreen && p.look.fullscreen === "hide"));
      this.render();
    }
    if (p.day && (p.day.place !== before.day.place || p.day.calendars !== before.day.calendars)) void this.day.refresh(true);
    if (p.island) {
      if (p.island.rest !== before.island.rest) this.dispatch({ type: "rest", size: p.island.rest });
      if (p.island.dock !== before.island.dock) this.renderDock();
      this.render();
    }
  }

  private async watchBattery() {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (!nav.getBattery) return;
    try {
      const b = await nav.getBattery();
      const read = () => {
        // A desktop reports a full battery that is always charging: no battery to show.
        this.battery = b.level === 1 && b.charging && !("chargingTime" in b && (b as unknown as { chargingTime: number }).chargingTime > 0) ? null : { level: b.level, charging: b.charging };
        this.renderHead();
      };
      read();
      b.addEventListener("levelchange", read);
      b.addEventListener("chargingchange", read);
    } catch {
      /* no battery API */
    }
  }

  private box(): Box {
    const s = this.state;
    const i = this.settings.island;
    const box = islandBox(s.size, i.shape, i.scale, undefined, window.screen?.width);
    if (this.ask.current) {
      // As wide as it needs, as tall as what it asks.
      const k = Math.min(1.4, Math.max(0.8, i.scale));
      const width = Math.max(box.width, Math.round(ASK_WIDTH * k));
      this.ask.el.style.width = `${width}px`;
      this.ask.paint();
      return { ...box, width, height: HEAD + this.ask.el.offsetHeight, radius: Math.round(24 * k) };
    }
    this.ask.paint();
    const k = Math.min(1.4, Math.max(0.8, i.scale));
    this.hud.paint();
    if (this.hud.current?.kind === "ring" || this.hud.current?.kind === "water") {
      // A ringing alarm (and the water reminder) shows even on an open island.
      const width = Math.max(box.width, Math.round(NOTICE_WIDTH * k));
      this.hud.el.style.width = `${width}px`;
      return { ...box, width, height: Math.max(this.hud.el.offsetHeight, 96), radius: Math.round(24 * k) };
    }
    if (this.hud.current && s.size !== "extended") {
      if (this.hud.current.kind === "lock" || this.hud.current.kind === "keyboard") {
        return { ...box, width: Math.max(box.width, Math.round(280 * k)), height: Math.max(box.height, Math.round(36 * k)) };
      }
      const width = Math.max(box.width, Math.round(NOTICE_WIDTH * k));
      this.hud.el.style.width = `${width}px`;
      return { ...box, width, height: this.hud.el.offsetHeight, radius: Math.round(22 * k) };
    }
    this.banner.paint();
    if (!this.banner.current || s.size === "extended") return box;
    return { ...box, width: Math.max(box.width, Math.round(NOTICE_WIDTH * k)), height: Math.round(NOTICE_HEIGHT * k), radius: Math.round(24 * k) };
  }

  private render() {
    const s = this.state;
    const look = this.look;
    const shape = this.settings.island.shape;
    const box = this.box();
    const ear = earSize(box, shape);
    const asking = this.ask.current != null;
    const overlay = asking
      ? " asking"
      : this.hud.current && (s.size !== "extended" || this.hud.current.kind === "ring" || this.hud.current.kind === "water")
        ? ` hudding hud-${this.hud.current.kind}`
        : this.banner.current && s.size !== "extended"
          ? " noticing"
          : "";
    this.shell.className = `${s.size} ${shape}${look.glow || this.settings.look.glow ? " glow" : ""}${overlay}`;
    this.shell.style.width = `${box.width}px`;
    this.shell.style.height = `${box.height}px`;
    this.shell.style.borderRadius = borderRadius(box, shape);
    this.shell.style.marginTop = `${box.gap}px`;
    this.shell.style.setProperty("--bg", look.color !== "#000" ? look.color : background(this.settings.look.color, this.settings.look.glass));
    // The island stays its own colour (black by default) on every page: no tint from the cover.
    const tint = look.tint;
    this.shell.style.setProperty("--tint", tint ?? "none");
    const showsMedia = !!this.media?.playing && s.size === "small";
    const dl = this.shownDownload();
    const counting = this.focus.state.running;
    this.shell.classList.toggle("playing", showsMedia && !dl && !counting);
    this.shell.classList.toggle("counting", counting && !dl);
    this.countdown.className = `countdown ph-${this.focus.state.phase}`;
    this.shell.classList.toggle("downloading", !!dl);
    this.shell.classList.toggle("caps", this.locks.caps);
    this.shell.classList.toggle("unread", this.unread > 0);
    this.countBadge.textContent = this.unread > 99 ? "99+" : String(this.unread);
    this.paintRing();
    if (this.media?.cover) this.miniCover.style.backgroundImage = `url("${this.media.cover}")`;
    else this.miniCover.style.backgroundImage = "";
    this.shell.style.setProperty("--ear", `${ear}px`);
    const win = windowSize(box);
    void Bridge.layout(win.width, win.height);

    for (const b of this.dock.querySelectorAll<HTMLButtonElement>(".dock-btn")) b.classList.toggle("on", b.dataset.page === s.page);
    const page = PAGES.find((p) => p.id === s.page) ?? PAGES[0];
    this.dockLabel.textContent = t(page.label);
    this.menu.classList.toggle("on", this.holds.has("pin"));
    if (s.size === "extended" && s.page === "inbox") this.unread = 0;
    const open = s.size === "extended" ? s.page : null;
    if (open !== this.shownPage) {
      if (this.shownPage === "controls") this.controlsView.close();
      if (this.shownPage === "system") this.systemView.close();
      if (this.shownPage === "desk") this.deskView.close();
      this.shownPage = open;
      this.renderPage(page);
    }
    this.renderHead();
  }

  private renderHead() {
    const now = new Date();
    const date = now.toLocaleDateString(language(), { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, "").toUpperCase();
    this.headLeft.textContent = date;
    this.headRight.textContent = now.toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" });
    // The medium island's other items (not the clock and date, already there).
    this.headItems.replaceChildren();
    this.renderSmall();
    if (this.state.size !== "small") {
      if (this.locks.caps) this.headItems.append(el("span", "head-item item-caps", "CAPS"));
      if (this.shownDownload()) this.headItems.append(this.ring);
      const busy = this.sessions.filter((x) => x.state === "working");
      if (busy.length) this.headItems.append(el("span", "head-item item-cc", busy.length > 1 ? t("{n} sessions", { n: busy.length }) : busy[0].project));
      const ctx = this.itemContext();
      for (const id of this.items.medium) {
        if (id === "clock" || id === "date") continue;
        if (id === "notifications") {
          this.bell.classList.toggle("has", this.unread > 0);
          this.bell.dataset.count = this.unread > 99 ? "99+" : String(this.unread);
          this.headItems.append(this.bell);
          continue;
        }
        if (id === "countdown") {
          if (this.focus.state.running) this.headItems.append(this.countdown);
          continue;
        }
        if (id === "waves") {
          if (this.media?.playing) this.headItems.append(this.wavesHead.el);
          continue;
        }
        if (id === "keyboard") {
          const kb = this.keyboard;
          const cur = kb?.layouts.find((l) => l.id === kb.current);
          if (!kb || kb.layouts.length < 2 || !cur) continue;
          const b = el("button", "head-kb", cur.short);
          b.title = `${cur.name} — ${t("click to switch")}`;
          b.addEventListener("click", (e) => {
            e.stopPropagation();
            const n = nextLayout(kb.layouts, kb.current);
            if (n) void Bridge.keyboardSet(n.id);
          });
          this.headItems.append(b);
          continue;
        }
        if (id === "taskbar") {
          const row = el("span", "head-apps");
          for (const a of this.openApps.slice(0, 8)) {
            const b = el("button", `head-app${a.active ? " on" : ""}`);
            b.title = a.title;
            b.append(appIcon(a.exe, (a.app[0] ?? "?").toUpperCase()));
            b.addEventListener("click", (e) => {
              e.stopPropagation();
              void Bridge.appWindow(a.id, "activate");
            });
            row.append(b);
          }
          if (this.openApps.length) this.headItems.append(row);
          continue;
        }
        const v = itemView(id, now, ctx);
        if (v) this.headItems.append(el("span", `head-item item-${id}`, v.text));
      }
    }
  }

  private renderPage(page: { id: Page; label: string; phase: number }) {
    this.page.replaceChildren();
    if (page.id === "home") {
      // Three cards, as the video: the assistant, what plays, focus.
      const card = (label: string, big: string, small: string, cls: string, go?: Page) => {
        const c = el("div", `card ${cls}`);
        c.append(el("div", "card-label", label), el("div", "card-big", big), el("div", "card-small", small));
        if (go) {
          c.classList.add("go");
          c.addEventListener("click", (e) => {
            e.stopPropagation();
            this.dispatch({ type: "open", page: go });
          });
        }
        return c;
      };
      this.page.append(this.homeGrid(card));
      return;
    }
    if (page.id === "assistant") {
      this.chat.paint();
      this.page.append(this.chat.el);
      this.chat.focus();
      return;
    }
    if (page.id === "focus") {
      this.focusView.paint();
      this.page.append(this.focusView.el);
      return;
    }
    if (page.id === "inbox") {
      this.inbox.paint();
      this.page.append(this.inbox.el);
      return;
    }
    if (page.id === "media") {
      this.mediaView.paint();
      this.page.append(this.mediaView.el);
      return;
    }
    if (page.id === "controls") {
      this.controlsView.setDownloads(this.downloads);
      this.page.append(this.controlsView.el);
      void this.controlsView.open();
      return;
    }
    if (page.id === "today") {
      this.todayView.paint();
      this.page.append(this.todayView.el);
      void this.day.refresh();
      return;
    }
    if (page.id === "notes") {
      this.notesView.paint();
      this.page.append(this.notesView.el);
      return;
    }
    if (page.id === "desk") {
      this.page.append(this.deskView.el);
      void this.deskView.open();
      return;
    }
    if (page.id === "system") {
      this.page.append(this.systemView.el);
      this.systemView.open();
      return;
    }
    if (page.id === "tools") {
      this.page.append(this.toolsView.el);
      this.toolsView.open();
      return;
    }
    if (page.id === "settings") {
      this.settingsView.paint();
      this.page.append(this.settingsView.el);
      return;
    }
    const wrap = el("div", "page-wrap");
    const text = el("div", "page-text");
    text.append(el("h2", "", t(page.label)), el("p", "", t("This page arrives in phase {n}.", { n: page.phase })));
    wrap.append(text);
    this.page.append(wrap);
  }

  /**
   * The home page: Manga alone, floating on black (a click talks to him);
   * what plays with its buttons; focus (timer, alarm, pomodoro); the next events.
   */
  private homeGrid(card: (label: string, big: string, small: string, cls: string, go?: Page) => HTMLElement) {
    const grid = el("div", "home");
    const go = (e: HTMLElement, page: Page) => {
      e.classList.add("go");
      e.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.dispatch({ type: "open", page });
      });
    };

    // Manga.
    const manga = el("div", "h-manga");
    manga.append(this.homeFace.el);
    const cc = this.sessions[0];
    if (cc) manga.append(el("span", "h-cc", `${cc.project} · ${cc.state === "waiting" ? t("Waiting for you") : cc.doing}`));
    go(manga, cc ? "settings" : "assistant");
    manga.title = t("Talk to Manga");

    // What plays, with its buttons.
    const m = this.media;
    const player = el("div", `h-player${m?.cover ? " has-cover" : ""}`);
    if (m?.cover) player.style.setProperty("--cover", `url("${m.cover}")`);
    const info = el("div", "h-info");
    info.append(
      el("span", "card-label", m ? (m.playing ? t("NOW PLAYING") : t("PAUSED")) : t("NOW PLAYING")),
      el("b", "h-title", m?.title ?? t("Nothing playing")),
      el("span", "h-sub", m ? subtitle(m) : t("Any app")),
    );
    const row = el("div", "h-controls");
    const btn = (path: string, label: string, act: () => void, cls = "") => {
      const b = el("button", `h-btn ${cls}`);
      b.title = label;
      b.append(icon(path, cls ? 18 : 15));
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        act();
      });
      return b;
    };
    if (m) {
      row.append(
        btn(I.prev, t("Previous"), () => void Bridge.mediaControl("previous")),
        btn(m.playing ? I.pause : I.play, m.playing ? t("Pause") : t("Play"), () => void Bridge.mediaControl("play_pause"), "main"),
        btn(I.next, t("Next"), () => void Bridge.mediaControl("next")),
      );
      const bar = el("div", "h-bar");
      bar.append(el("div", "h-fill live-progress"));
      info.append(bar);
    }
    player.append(info, row);
    go(player, "media");

    // Focus: the pomodoro, the timer or the next alarm, and its button.
    const f = this.focus.state;
    const focus = el("div", `h-focus ph-${f.phase}`);
    const nextAlarm = this.focus.alarms.filter((a) => a.on).map((a) => a.time).sort()[0];
    focus.append(
      el("span", "card-label", phaseName(f.phase).toUpperCase()),
      el("b", "h-time live-count", focusClock(focusShown(f, Date.now()))),
      el("span", "h-sub", nextAlarm ? `⏰ ${nextAlarm}` : f.running ? t("Running") : t("Ready")),
    );
    focus.append(
      btn(f.running ? I.pause : I.play, f.running ? t("Pause") : t("Start"), () => this.focus.toggle(), "main focus-go"),
    );
    go(focus, "focus");

    // The next events.
    const events = el("div", "h-events");
    events.append(el("span", "card-label", t("EVENTS")));
    const list = this.day.upcoming(3, 3);
    if (!list.length) events.append(el("span", "h-sub", this.day.events.length ? t("Nothing in the next days.") : t("Add your calendars in Settings → The day.")));
    for (const o of list) {
      const r = el("div", "h-event");
      r.append(el("b", "", o.title || t("(no title)")), el("span", "", when(o)));
      events.append(r);
    }
    go(events, "today");

    void card;
    grid.append(manga, player, focus, events);
    return grid;
  }




  /** The video, live, in the media page's cover (Windows draws it there). */
  private live() {
    const want = this.mediaView.liveWanted && this.state.size === "extended" && this.state.page === "media" && !this.ask.current && this.hud.current?.kind !== "ring";
    if (!want) {
      if (this.liveOn) {
        this.liveOn = false;
        this.liveRect = "";
        void Bridge.mediaLiveOff();
      }
      return;
    }
    const r = this.mediaView.coverRect();
    if (!r || r.width < 20) return;
    const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
    if (key === this.liveRect) return;
    this.liveRect = key;
    this.liveOn = true;
    void Bridge.mediaLive(r.left, r.top, r.width, r.height).then((res) => {
      if (res && "error" in res) this.mediaView.liveFailed(res.error);
    });
  }

  private lastMinute = -1;
  private loop() {
    const frame = () => {
      this.banner.frame();
      if (this.state.size === "small" && !this.banner.current) {
        if (this.settings.island.center === "eyes") this.eyesBig.draw();
        if (this.media?.playing) this.wavesSmall.draw();
      } else {
        if (this.media?.playing) this.wavesHead.draw();
      }
      if (this.state.size === "extended" && this.state.page === "media") this.mediaView.frame();
      if (this.state.size === "extended" && this.state.page === "focus") this.focusView.frame();
      if (this.hud.current?.kind === "ring" || this.hud.current?.kind === "water" || this.hud.current?.kind === "say") this.ringFace.draw();
      const fs = this.focus.state;
      // The focus line along the bottom of the island fills as the phase goes.
      this.focusLine.classList.toggle("on", fs.running && fs.mode !== "stopwatch");
      if (fs.running) {
        this.focusLine.style.width = `${focusProgress(fs, Date.now()) * 100}%`;
        this.focusLine.dataset.phase = fs.phase;
      }
      if (fs.running) {
        const txt = focusClock(focusShown(fs, Date.now()));
        if (this.countdown.textContent !== txt) this.countdown.textContent = txt;
        const live = this.page.querySelector(".live-count");
        if (live && live.textContent !== txt) live.textContent = txt;
      }
      if (this.state.size === "extended" && this.state.page === "assistant") this.chat.frame();
      if (this.state.size === "extended" && this.state.page === "home" && this.homeFace.el.isConnected) {
        this.homeFace.draw();
        const fill = this.page.querySelector<HTMLElement>(".live-progress");
        const m = this.media;
        if (fill && m && m.duration > 0) fill.style.width = `${(positionNow(m, this.mediaReadAt, Date.now()) / m.duration) * 100}%`;
      }
      this.live();
      const m = new Date().getMinutes();
      if (m !== this.lastMinute) {
        this.lastMinute = m;
        this.renderHead();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
