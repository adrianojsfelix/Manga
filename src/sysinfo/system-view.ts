// The PC at a glance: CPU, memory, the graphics card and its memory, the
// network down and up, the disk, how long it has been on — each with a
// line of the last minute.

import { Bridge, IN_APP } from "../core/bridge.ts";
import { language, t } from "../core/i18n.ts";
import { el } from "../island/dom.ts";
import { size } from "../system/activity.ts";
import { pct, push, sparkline, uptime, type SysInfo } from "./stats.ts";

type Key = "cpu" | "ram" | "gpu" | "vram" | "down" | "up";

// What the browser preview shows (no Windows there).
function sample(prev: SysInfo | null): SysInfo {
  const w = (v: number, d: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v + (Math.random() - 0.5) * d));
  return {
    cpu: w(prev?.cpu ?? 23, 14, 3, 96),
    ramUsed: w(prev?.ramUsed ?? 9.6e9, 2e8, 6e9, 15e9),
    ramTotal: 16e9,
    gpu: w(prev?.gpu ?? 12, 10, 0, 90),
    vramUsed: w(prev?.vramUsed ?? 2.1e9, 1e8, 1e9, 7e9),
    vramTotal: 8e9,
    down: w(prev?.down ?? 1.2e6, 9e5, 0, 9e6),
    up: w(prev?.up ?? 1.6e5, 1e5, 0, 2e6),
    diskUsed: 380e9,
    diskTotal: 512e9,
    uptime: (prev?.uptime ?? 3 * 3600 + 1200) + 1,
  };
}

export class SystemView {
  readonly el = el("div", "system");
  now: SysInfo | null = null;
  private history: Record<Key, number[]> = { cpu: [], ram: [], gpu: [], vram: [], down: [], up: [] };
  private timer: number | null = null;

  constructor(private onRead: (s: SysInfo) => void = () => {}) {}

  /** Reads now and then every second while the page is open. */
  open() {
    this.paint();
    void this.read();
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.read(), 1000);
  }

  close() {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
  }

  async read() {
    const s = IN_APP ? await Bridge.sysinfo() : sample(this.now);
    if (!s) return;
    this.now = s;
    const h = this.history;
    h.cpu = push(h.cpu, s.cpu);
    h.ram = push(h.ram, pct(s.ramUsed, s.ramTotal));
    h.gpu = push(h.gpu, Math.max(0, s.gpu));
    h.vram = push(h.vram, pct(s.vramUsed, s.vramTotal));
    h.down = push(h.down, s.down);
    h.up = push(h.up, s.up);
    this.onRead(s);
    if (this.el.isConnected) this.paint();
  }

  private card(key: Key, label: string, big: string, small: string, max?: number) {
    const c = el("div", `sys-card k-${key}`);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 30");
    svg.setAttribute("preserveAspectRatio", "none");
    const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", sparkline(this.history[key], 100, 28, max));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke-width", "1.6");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(line);
    c.append(el("span", "sys-label", label), el("b", "sys-big", big), el("span", "sys-small", small), svg);
    return c;
  }

  paint() {
    this.el.replaceChildren();
    const s = this.now;
    if (!s) {
      this.el.append(el("p", "set-note", t("Reading…")));
      return;
    }
    const lang = language();
    const net = Math.max(1, ...this.history.down, ...this.history.up);
    this.el.append(
      this.card("cpu", "CPU", `${Math.round(s.cpu)}%`, t("processor"), 100),
      this.card("ram", t("Memory"), `${pct(s.ramUsed, s.ramTotal)}%`, `${size(s.ramUsed, lang)} ${t("of")} ${size(s.ramTotal, lang)}`, 100),
      this.card("gpu", "GPU", s.gpu < 0 ? "—" : `${Math.round(s.gpu)}%`, t("graphics card"), 100),
      this.card("vram", "VRAM", s.vramTotal ? `${pct(s.vramUsed, s.vramTotal)}%` : "—", s.vramTotal ? `${size(s.vramUsed, lang)} ${t("of")} ${size(s.vramTotal, lang)}` : t("unknown"), 100),
      this.card("down", "Download", `${size(s.down, lang)}/s`, t("receiving"), net),
      this.card("up", "Upload", `${size(s.up, lang)}/s`, t("sending"), net),
    );
    const foot = el("div", "sys-foot");
    foot.append(
      el("span", "", `${t("Disk")} C: ${size(s.diskUsed, lang)} ${t("of")} ${size(s.diskTotal, lang)} (${pct(s.diskUsed, s.diskTotal)}%)`),
      el("span", "", `${t("On for")} ${uptime(s.uptime)}`),
    );
    this.el.append(foot);
  }
}
