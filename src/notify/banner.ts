// A Windows notification dropping from the notch: Kumo announces it, the
// app's real icon, the title and the text, how many more are waiting, and ×.
// One at a time; the next comes when it leaves. The pointer on it holds it.

import { Bridge } from "../core/bridge.ts";
import { t } from "../core/i18n.ts";
import { Canvas, el, icon } from "../island/dom.ts";
import { I } from "../island/icons.ts";
import type { Kumo } from "../mascot/kumo.ts";
import { announce, appColor, type Notice } from "./notices.ts";

const icons = new Map<string, string | null>();

export class Banner {
  readonly el = el("div", "banner");
  private queue: Notice[] = [];
  private timer: number | null = null;
  private hovering = false;
  private face: Canvas;

  constructor(
    kumo: Kumo,
    private seconds: () => number,
    private changed: () => void,
    private open: () => void,
  ) {
    this.face = new Canvas(46, 46, "banner-kumo", (x) => kumo.draw(x, 46, 46, 30));
    this.el.addEventListener("mouseenter", () => {
      this.hovering = true;
      this.stop();
    });
    this.el.addEventListener("mouseleave", () => {
      this.hovering = false;
      this.arm();
    });
    this.el.addEventListener("click", (e) => {
      e.stopPropagation();
      this.clear();
      this.open();
    });
  }

  get current(): Notice | null {
    return this.queue[0] ?? null;
  }

  push(n: Notice) {
    this.queue.push(n);
    if (this.queue.length === 1) this.arm();
    if (n.aumid && !icons.has(n.aumid)) {
      icons.set(n.aumid, null);
      void Bridge.appIcon(n.aumid).then((src) => {
        icons.set(n.aumid!, src);
        if (this.current?.aumid === n.aumid) this.changed();
      });
    }
    this.changed();
  }

  clear() {
    this.stop();
    this.queue = [];
    this.changed();
  }

  private stop() {
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private arm() {
    this.stop();
    if (this.hovering || !this.queue.length) return;
    this.timer = window.setTimeout(() => this.next(), this.seconds() * 1000);
  }

  private next() {
    this.queue.shift();
    this.arm();
    this.changed();
  }

  frame() {
    if (this.current) this.face.draw();
  }

  paint() {
    const n = this.current;
    this.el.replaceChildren();
    if (!n) return;
    const badge = el("span", "banner-icon");
    const src = n.aumid ? icons.get(n.aumid) : null;
    if (src) badge.style.backgroundImage = `url("${src}")`;
    else {
      badge.textContent = (n.app.trim()[0] ?? "?").toUpperCase();
      badge.style.background = appColor(n.app);
    }
    const who = el("span", "banner-who");
    who.append(this.face.el, badge);

    const text = el("div", "banner-text");
    text.append(
      el("span", "banner-say", announce(n.app, this.queue.length, n.id)),
      el("b", "banner-title", n.title || n.body),
      el("span", "banner-body", n.title ? n.body : ""),
    );
    const side = el("div", "banner-side");
    const close = el("button", "banner-close");
    close.title = t("Dismiss");
    close.append(icon(I.close, 13));
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      this.next();
    });
    side.append(close);
    if (this.queue.length > 1) side.append(el("span", "banner-more", `+${this.queue.length - 1}`));
    this.el.append(who, text, side);
  }
}
