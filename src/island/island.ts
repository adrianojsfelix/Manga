// The island on screen, shaped like a MacBook's notch by default: glued to
// the top, its two ears curving into the screen's edge.
// - small: only Kumo's glowing eyes;
// - medium: a header — the date on the left, the eyes in the middle, the
//   time on the right — with the items of the bar;
// - extended: the same header, a page, and the dock of pages at the bottom.
// It follows the state machine (core/island-state.ts) and sizes its window
// through Rust.

import { Bridge } from "../core/bridge.ts";
import { borderRadius, earSize, islandBox, windowSize, type IslandShape } from "../core/geometry.ts";
import { FOLD_AFTER_MS, INITIAL, next, type IslandEvent, type IslandState, type Page } from "../core/island-state.ts";
import { language, t } from "../core/i18n.ts";
import { itemView, type ItemPrefs } from "../items/registry.ts";
import { Kumo, drawGlowEyes } from "../mascot/kumo.ts";

export interface Look {
  shape: IslandShape;
  scale: number;
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
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
};

const PAGES: { id: Page; label: string; phase: number }[] = [
  { id: "home", label: "Home", phase: 1 },
  { id: "assistant", label: "Assistant", phase: 2 },
  { id: "media", label: "Media", phase: 3 },
  { id: "focus", label: "Focus", phase: 4 },
  { id: "controls", label: "Controls", phase: 3 },
  { id: "notes", label: "Notes", phase: 5 },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function icon(path: string, size = 16): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", path);
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "1.7");
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("stroke-linejoin", "round");
  s.append(p);
  return s;
}

/** A canvas that draws Kumo every frame, at the screen's pixel density. */
class Canvas {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  constructor(readonly w: number, readonly h: number, cls: string, private paint: (x: CanvasRenderingContext2D) => void) {
    this.el = el("canvas", cls);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.el.width = Math.round(w * dpr);
    this.el.height = Math.round(h * dpr);
    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;
    this.ctx = this.el.getContext("2d")!;
    this.ctx.scale(dpr, dpr);
  }
  draw() {
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.paint(this.ctx);
  }
}

export class Island {
  state: IslandState = INITIAL;
  look: Look = { shape: "notch", scale: 1, color: "#000", tint: null, glow: false };
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
  // Extended: the page and the dock.
  private page = el("div", "page");
  private dock = el("div", "dock");
  private dockLabel = el("span", "dock-label");
  private kumoBig = new Canvas(150, 150, "kumo-big", (x) => this.kumo.draw(x, 150, 150, 86));
  private foldTimer: number | null = null;
  private pinned = false;

  constructor(root: HTMLElement, items: ItemPrefs) {
    this.items = items;
    this.shell.id = "island";

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
      this.pinned = !this.pinned;
      this.dispatch({ type: "hold", on: this.pinned });
      this.render();
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
      this.dock.append(b);
    }
    this.dock.append(this.dockLabel);

    const body = el("div", "body");
    body.append(this.page, this.dock);
    this.clip.append(small, head, body);
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

  private render() {
    const s = this.state;
    const look = this.look;
    const box = islandBox(s.size, look.shape, look.scale);
    const ear = earSize(box, look.shape);
    this.shell.className = `${s.size} ${look.shape}${look.glow ? " glow" : ""}`;
    this.shell.style.width = `${box.width}px`;
    this.shell.style.height = `${box.height}px`;
    this.shell.style.borderRadius = borderRadius(box, look.shape);
    this.shell.style.marginTop = `${box.gap}px`;
    this.shell.style.setProperty("--bg", look.color);
    this.shell.style.setProperty("--tint", look.tint ?? "none");
    this.shell.style.setProperty("--ear", `${ear}px`);
    const win = windowSize(box);
    void Bridge.layout(win.width, win.height);

    for (const b of this.dock.querySelectorAll<HTMLButtonElement>(".dock-btn")) b.classList.toggle("on", b.dataset.page === s.page);
    const page = PAGES.find((p) => p.id === s.page) ?? PAGES[0];
    this.dockLabel.textContent = t(page.label);
    this.menu.classList.toggle("on", this.pinned);
    this.renderPage(page);
    this.renderHead();
  }

  private renderHead() {
    const now = new Date();
    const date = now.toLocaleDateString(language(), { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, "").toUpperCase();
    this.headLeft.textContent = date;
    this.headRight.textContent = now.toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" });
    // The medium island's other items (not the clock and date, already there).
    this.headItems.replaceChildren();
    if (this.state.size === "medium") {
      for (const id of this.items.medium) {
        if (id === "clock" || id === "date") continue;
        const v = itemView(id, now);
        if (v) this.headItems.append(el("span", "head-item", v.text));
      }
    }
  }

  private renderPage(page: { id: Page; label: string; phase: number }) {
    this.page.replaceChildren();
    if (page.id === "home") {
      // Three cards, as the video: the assistant, what plays, focus.
      const card = (label: string, big: string, small: string, cls: string) => {
        const c = el("div", `card ${cls}`);
        c.append(el("div", "card-label", label), el("div", "card-big", big), el("div", "card-small", small));
        return c;
      };
      const cards = el("div", "cards");
      cards.append(
        card("KUMO", t("Hi!"), t("Ask me anything"), "c-kumo"),
        card(t("NOW PLAYING"), t("Nothing playing"), t("Phase {n}", { n: 3 }), "c-media"),
        card(t("FOCUS"), "25:00", t("Ready"), "c-focus"),
      );
      this.page.append(cards);
      return;
    }
    const wrap = el("div", "page-wrap");
    const text = el("div", "page-text");
    if (page.id === "assistant") {
      wrap.append(this.kumoBig.el);
      text.append(el("h2", "", t("Hi! I'm {name}.", { name: "Kumo" })), el("p", "", t("Ask me anything, or click a page above.")));
    } else {
      text.append(el("h2", "", t(page.label)), el("p", "", t("This page arrives in phase {n}.", { n: page.phase })));
    }
    wrap.append(text);
    this.page.append(wrap);
  }

  private lastMinute = -1;
  private loop() {
    const frame = () => {
      if (this.state.size === "small") this.eyesBig.draw();
      else this.eyesSmall.draw();
      if (this.state.size === "extended" && this.state.page === "assistant") this.kumoBig.draw();
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
