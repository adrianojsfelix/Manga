// The island on screen: the bar (small and medium) with Kumo and the items,
// and the open island (extended) with its pages. It follows the state
// machine (core/island-state.ts) and sizes its window through Rust.

import { Bridge } from "../core/bridge.ts";
import { borderRadius, islandBox, windowSize, type IslandShape } from "../core/geometry.ts";
import { FOLD_AFTER_MS, INITIAL, next, type IslandEvent, type IslandState, type Page } from "../core/island-state.ts";
import { t } from "../core/i18n.ts";
import { ITEMS, itemView, type ItemPrefs } from "../items/registry.ts";
import { Kumo } from "../mascot/kumo.ts";

export interface Look {
  shape: IslandShape;
  scale: number;
  color: string;
  glow: boolean;
}

const PAGES: { id: Page; label: string; phase: number }[] = [
  { id: "assistant", label: "Assistant", phase: 2 },
  { id: "today", label: "Today", phase: 5 },
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

class KumoCanvas {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  constructor(private kumo: Kumo, private css: number, cls: string, private ball = 0.58) {
    this.el = el("canvas", cls);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.el.width = Math.round(css * dpr);
    this.el.height = Math.round(css * dpr);
    this.el.style.width = `${css}px`;
    this.el.style.height = `${css}px`;
    this.ctx = this.el.getContext("2d")!;
    this.ctx.scale(dpr, dpr);
  }
  draw() {
    this.ctx.clearRect(0, 0, this.css, this.css);
    // The ahoge and the marks need room above and beside the ball.
    this.kumo.draw(this.ctx, this.css, this.css, this.css * this.ball);
  }
}

export class Island {
  state: IslandState = INITIAL;
  look: Look = { shape: "floating", scale: 1, color: "#000", glow: false };
  items: ItemPrefs;
  readonly kumo = new Kumo();

  private root: HTMLElement;
  private island = el("div");
  private barItems = el("div", "items");
  private tabs = el("div", "tabs");
  private pageTitle = el("h2");
  private pageText = el("p");
  private pin = el("button", "icon-btn", "📌");
  private small: KumoCanvas;
  private big: KumoCanvas;
  private foldTimer: number | null = null;
  private pinned = false;

  constructor(root: HTMLElement, items: ItemPrefs) {
    this.root = root;
    this.items = items;
    this.island.id = "island";
    // In the bar he fits the island's height, ahoge included.
    this.small = new KumoCanvas(this.kumo, 34, "kumo", 0.5);
    this.big = new KumoCanvas(this.kumo, 150, "kumo-big");

    const bar = el("div", "bar");
    bar.append(this.small.el, this.barItems);

    for (const p of PAGES) {
      const b = el("button", "tab", t(p.label));
      b.dataset.page = p.id;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.dispatch({ type: "open", page: p.id });
      });
      this.tabs.append(b);
    }
    const close = el("button", "icon-btn", "✕");
    close.title = t("Close");
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      this.pinned = false;
      this.dispatch({ type: "hold", on: false });
      this.dispatch({ type: "fold" });
    });
    this.pin.title = t("Pin the island open");
    this.pin.addEventListener("click", (e) => {
      e.stopPropagation();
      this.pinned = !this.pinned;
      this.dispatch({ type: "hold", on: this.pinned });
    });
    this.tabs.append(el("span", "grow"), this.pin, close);

    const page = el("div", "page");
    const content = el("div", "content");
    content.append(this.pageTitle, this.pageText);
    page.append(this.big.el, content);
    const open = el("div", "open");
    open.append(this.tabs, page);

    this.island.append(bar, open);
    this.root.append(this.island);

    this.island.addEventListener("mouseenter", () => {
      if (this.foldTimer != null) window.clearTimeout(this.foldTimer);
      this.dispatch({ type: "enter" });
    });
    this.island.addEventListener("mouseleave", () => {
      this.dispatch({ type: "leave" });
      if (this.foldTimer != null) window.clearTimeout(this.foldTimer);
      this.foldTimer = window.setTimeout(() => this.dispatch({ type: "fold" }), FOLD_AFTER_MS);
    });
    this.island.addEventListener("click", () => {
      this.kumo.flash("happy", 1.2);
      this.dispatch({ type: "click" });
    });
    this.island.addEventListener("mousemove", (e) => {
      const r = this.island.getBoundingClientRect();
      this.kumo.lookX = Math.max(-1, Math.min(1, (e.clientX - r.left - 40) / 200));
      this.kumo.lookY = Math.max(-1, Math.min(1, (e.clientY - r.top - 20) / 60));
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
    const box = islandBox(s.size, this.look.shape, this.look.scale);
    this.island.className = s.size + (this.look.glow ? " glow" : "");
    this.island.style.width = `${box.width}px`;
    this.island.style.height = `${box.height}px`;
    this.island.style.borderRadius = borderRadius(box, this.look.shape);
    this.island.style.marginTop = `${box.gap}px`;
    this.island.style.setProperty("--bg", this.look.color);
    const win = windowSize(box);
    void Bridge.layout(win.width, win.height);

    for (const b of this.tabs.querySelectorAll<HTMLButtonElement>(".tab")) b.classList.toggle("on", b.dataset.page === s.page);
    this.pin.classList.toggle("on", this.pinned);
    const page = PAGES.find((p) => p.id === s.page)!;
    if (page.id === "assistant") {
      this.pageTitle.textContent = t("Hi! I'm {name}.", { name: "Kumo" });
      this.pageText.textContent = t("Ask me anything, or click a page above.");
    } else {
      this.pageTitle.textContent = t(page.label);
      this.pageText.textContent = t("This page arrives in phase {n}.", { n: page.phase });
    }
    this.renderItems();
  }

  private renderItems() {
    const now = new Date();
    const ids = this.state.size === "small" ? this.items.small : this.items.medium;
    this.barItems.replaceChildren();
    for (const id of ids) {
      const v = itemView(id, now);
      if (!v) continue;
      const def = ITEMS.find((i) => i.id === id)!;
      this.barItems.append(el("span", def.id === "date" ? "item dim" : "item", v.text));
    }
  }

  private lastMinute = -1;
  private loop() {
    const frame = () => {
      if (this.state.size === "extended") this.big.draw();
      else this.small.draw();
      const m = new Date().getMinutes();
      if (m !== this.lastMinute) {
        this.lastMinute = m;
        this.renderItems();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
