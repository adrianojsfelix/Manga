// Small helpers to build the island's elements.

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** A 24×24 stroke icon. */
export function icon(path: string, size = 16): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("aria-hidden", "true");
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

/** A canvas drawn every frame, at the screen's pixel density. */
export class Canvas {
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

/** A text field that takes the keyboard from Windows while it is in use. */
export function typing(field: HTMLInputElement | HTMLTextAreaElement, hold: (on: boolean) => void) {
  field.addEventListener("focus", () => hold(true));
  field.addEventListener("blur", () => hold(false));
}
