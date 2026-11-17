// The island on screen, shaped like a MacBook's notch by default: glued to
// the top, its two ears curving into the screen's edge.
// - small: only Kumo's glowing eyes;
// - medium: a header — the date on the left, the eyes in the middle, the
//   time on the right — with the items of the bar;
// - extended: the same header, a page, and the dock of pages at the bottom.
// A Windows notification drops in as a banner below the header for a few
// seconds. It follows the state machine (core/island-state.ts) and sizes its
// window through Rust.

import { ChatView } from "../assistant/chat-view.ts";
import { Bridge, on } from "../core/bridge.ts";
import { borderRadius, earSize, islandBox, windowSize, type Box } from "../core/geometry.ts";
import { FOLD_AFTER_MS, INITIAL, next, type IslandEvent, type IslandState, type Page } from "../core/island-state.ts";
import { language, t } from "../core/i18n.ts";
import type { Settings } from "../core/settings.ts";
import { itemView, type ItemContext, type ItemPrefs } from "../items/registry.ts";
import { Kumo, drawGlowEyes } from "../mascot/kumo.ts";
import { remember, shows, type Notice } from "../notify/notices.ts";
import { SettingsView } from "../settings/settings-view.ts";
import { Canvas, el, icon } from "./dom.ts";

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
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-2 1.2L14.8 21h-4l-.3-2.4a7 7 0 0 1-2-1.2l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-2.4L4.6 9.9l2-3.4 1.9.7a7 7 0 0 1 2-1.2l.3-2.4h4l.3 2.4a7 7 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 2.4z",
};

const PAGES: { id: Page; label: string; phase: number }[] = [
  { id: "home", label: "Home", phase: 1 },
  { id: "assistant", label: "Assistant", phase: 2 },
  { id: "media", label: "Media", phase: 3 },
  { id: "focus", label: "Focus", phase: 4 },
  { id: "controls", label: "Controls", phase: 3 },
  { id: "notes", label: "Notes", phase: 5 },
  { id: "settings", label: "Settings", phase: 2 },
];

/** The banner's height, unscaled. */
const NOTICE_HEIGHT = 74;
const NOTICE_WIDTH = 420;

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
  private eyesSmall = new Canvas(36, 22, "eyes-small", (x) => drawGlowEyes(x, this.kumo, 36, 22, 7));
  private menu = el("button", "head-menu", "···");
  // A notification.
  private banner = el("div", "banner");
  private notice: Notice | null = null;
  private noticeTimer: number | null = null;
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
  /** What holds the island open: the pin, a text field in use. */
  private holds = new Set<string>();
  private shownPage: Page | null = null;

  constructor(
    root: HTMLElement,
    items: ItemPrefs,
    private settings: Settings,
    private save: (s: Settings) => void,
  ) {
    this.items = items;
    this.shell.id = "island";
    this.state = { ...INITIAL, rest: settings.island.rest, size: settings.island.rest };

    const hold = (why: string) => (onIt: boolean) => this.hold(why, onIt);
    const change = (p: Partial<Settings>) => this.change(p);
    this.chat = new ChatView(this.kumo, () => this.settings, change, hold("chat"));
    this.settingsView = new SettingsView(() => this.settings, change, () => this.recent, hold("settings"));

    const small = el("div", "small-face");
    small.append(this.eyesBig.el);

    const head = el("div", "head");
    const center = el("span", "head-center");
    center.append(this.eyesSmall.el);
    const right = el("span", "head-right-box");
    right.append(this.headItems, this.headRight, this.menu);
    head.append(this.headLeft, center, right);
    this.menu.title = t("Pin the island open");
    this.menu.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hold("pin", !this.holds.has("pin"));
    });

    for (const p of PAGES) {
      const b = el("button", "dock-btn");
      b.dataset.page = p.id;
      b.title = t(p.label);
      b.append(icon(ICON[p.id], 17));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.dispatch({ type: "open", page: p.id });
      });
      if (p.id === "settings") b.classList.add("end");
      this.dock.append(b);
    }
    this.dock.insertBefore(this.dockLabel, this.dock.querySelector(".end"));

    this.banner.addEventListener("click", (e) => {
      e.stopPropagation();
      this.dropNotice();
      this.dispatch({ type: "open", page: "settings" });
    });

    const body = el("div", "body");
    body.append(this.page, this.dock);
    this.clip.append(small, head, this.banner, body);
    this.shell.append(this.earL, this.earR, this.clip);
    root.append(this.shell);

    this.shell.addEventListener("mouseenter", () => {
      if (this.foldTimer != null) window.clearTimeout(this.foldTimer);
      this.dispatch({ type: "enter" });
    });
    this.shell.addEventListener("mouseleave", () => {
      this.dispatch({ type: "leave" });
      if (this.foldTimer != null) window.clearTimeout(this.foldTimer);
      this.foldTimer = window.setTimeout(() => this.dispatch({ type: "fold" }), FOLD_AFTER_MS);
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
    void Bridge.notificationsWatch(settings.notifications.on);
    void this.watchBattery();

    this.render();
    this.loop();
  }

  dispatch(e: IslandEvent) {
    const before = this.state;
    this.state = next(this.state, e);
    if (before !== this.state) this.render();
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
    if (!(this.state.size === "extended" && this.state.page === "settings")) this.unread++;
    if (this.state.size === "extended") {
      // Open on a page: a little bang from Kumo, the list has it.
      this.kumo.flash("alert", 1.4);
      this.renderHead();
      return;
    }
    this.notice = n;
    this.kumo.flash("surprised", 1.4);
    if (this.noticeTimer != null) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => this.dropNotice(), s.seconds * 1000);
    this.render();
  }

  private dropNotice() {
    if (this.noticeTimer != null) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
    if (!this.notice) return;
    this.notice = null;
    this.render();
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
    if (p.island) {
      if (p.island.rest !== before.island.rest) this.dispatch({ type: "rest", size: p.island.rest });
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
    const box = islandBox(s.size, i.shape, i.scale);
    if (!this.notice || s.size === "extended") return box;
    const k = Math.min(1.4, Math.max(0.8, i.scale));
    return { ...box, width: Math.max(box.width, Math.round(NOTICE_WIDTH * k)), height: Math.round(NOTICE_HEIGHT * k), radius: Math.round(22 * k) };
  }

  private render() {
    const s = this.state;
    const look = this.look;
    const shape = this.settings.island.shape;
    const box = this.box();
    const ear = earSize(box, shape);
    this.shell.className = `${s.size} ${shape}${look.glow ? " glow" : ""}${this.notice && s.size !== "extended" ? " noticing" : ""}`;
    this.shell.style.width = `${box.width}px`;
    this.shell.style.height = `${box.height}px`;
    this.shell.style.borderRadius = borderRadius(box, shape);
    this.shell.style.marginTop = `${box.gap}px`;
    this.shell.style.setProperty("--bg", look.color);
    this.shell.style.setProperty("--tint", look.tint ?? "none");
    this.shell.style.setProperty("--ear", `${ear}px`);
    const win = windowSize(box);
    void Bridge.layout(win.width, win.height);

    for (const b of this.dock.querySelectorAll<HTMLButtonElement>(".dock-btn")) b.classList.toggle("on", b.dataset.page === s.page);
    const page = PAGES.find((p) => p.id === s.page) ?? PAGES[0];
    this.dockLabel.textContent = t(page.label);
    this.menu.classList.toggle("on", this.holds.has("pin"));
    if (s.size === "extended" && s.page === "settings") this.unread = 0;
    const open = s.size === "extended" ? s.page : null;
    if (open !== this.shownPage) {
      this.shownPage = open;
      this.renderPage(page);
    }
    this.renderBanner();
    this.renderHead();
  }

  private renderBanner() {
    const n = this.notice;
    this.banner.replaceChildren();
    if (!n) return;
    const badge = el("span", "banner-badge", (n.app.trim()[0] ?? "?").toUpperCase());
    const text = el("div", "banner-text");
    text.append(el("span", "banner-app", n.app), el("b", "banner-title", n.title || n.body), el("span", "banner-body", n.title ? n.body : ""));
    this.banner.append(badge, text);
  }

  private renderHead() {
    const now = new Date();
    const date = now.toLocaleDateString(language(), { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, "").toUpperCase();
    this.headLeft.textContent = date;
    this.headRight.textContent = now.toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" });
    // The medium island's other items (not the clock and date, already there).
    this.headItems.replaceChildren();
    if (this.state.size !== "small") {
      const ctx: ItemContext = { battery: this.battery, unread: this.unread };
      for (const id of this.items.medium) {
        if (id === "clock" || id === "date") continue;
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
      const cards = el("div", "cards");
      const last = this.recent[0];
      cards.append(
        card("KUMO", t("Hi!"), t("Ask me anything"), "c-kumo", "assistant"),
        card(t("NOW PLAYING"), t("Nothing playing"), t("Phase {n}", { n: 3 }), "c-media"),
        last
          ? card(t("NOTIFICATIONS"), last.title || last.app, last.app, "c-focus c-notice", "settings")
          : card(t("FOCUS"), "25:00", t("Ready"), "c-focus"),
      );
      this.page.append(cards);
      return;
    }
    if (page.id === "assistant") {
      this.chat.paint();
      this.page.append(this.chat.el);
      this.chat.focus();
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

  private lastMinute = -1;
  private loop() {
    const frame = () => {
      if (this.state.size === "small" && !this.notice) this.eyesBig.draw();
      else this.eyesSmall.draw();
      if (this.state.size === "extended" && this.state.page === "assistant") this.chat.frame();
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
