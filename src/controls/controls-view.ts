// The control center: the buttons the user picked (Wi-Fi, Bluetooth,
// airplane mode, dark mode, power mode, lock, sleep, Windows' pages and
// apps…) — "Edit" adds, removes and orders them —, each screen's
// brightness, the volume, each app's volume, and downloads.

import { Bridge, IN_APP, type Sound, type WinState } from "../core/bridge.ts";
import { language, t } from "../core/i18n.ts";
import { el, icon, typing } from "../island/dom.ts";
import { I } from "../island/icons.ts";
import { percent, progressText, size, type Download } from "../system/activity.ts";

type Radio = { kind: "wifi" | "bluetooth"; on: boolean };
type Screen = { id: string; name: string; value: number };

interface Control {
  id: string;
  /** English key for t(). */
  label: string;
  icon: string;
  /** A Windows page or app it opens (no state). */
  opens?: string;
  /** Asks a second click (restart, shut down). */
  confirm?: boolean;
}

const P = {
  airplane: "M10.5 3.5v6l-7 4v2l7-2v4.5l-2 1.5v1.5l3.5-1 3.5 1v-1.5l-2-1.5V13.5l7 2v-2l-7-4v-6a1.5 1.5 0 0 0-3 0z",
  dark: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  power: "M13 3 5 13.5h6L10 21l8-10.5h-6z",
  lock: I.lock,
  sleep: "M12 3v4M5.6 5.6l2.8 2.8M3 12h4M5.6 18.4l2.8-2.8M12 21v-4",
  restart: "M5 12a7 7 0 1 0 2.1-5M5 4.5V8h3.5",
  shutdown: "M12 3v8M7.5 6.3a7 7 0 1 0 9 0",
  bin: "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12",
  desktop: "M4 5h16v11H4zM9 20h6M12 16v4",
  snip: "M6 4v13a3 3 0 1 0 3 3M18 4v13a3 3 0 1 1-3 3M6 17l12-13M18 17 6 4",
  calc: "M6 3.5h12v17H6zM9 7h6M9 11h.01M12 11h.01M15 11h.01M9 14.5h.01M12 14.5h.01M15 14.5h.01M9 18h.01M12 18h3",
  tasks: "M4 18h3v-6H4zM10.5 18h3V6h-3zM17 18h3v-9h-3z",
  folder: I.folder,
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.4-1.4.3-2-3-1-1 2h-2l-1-2-3 1 .3 2L5.8 7.3 4 7l-1 3 2 1v2l-2 1 1 3 2-.3 1.4 1.4-.3 2 3 1 1-2h2l1 2 3-1-.3-2 1.4-1.4 2 .3 1-3-2-1z",
  night: "M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z",
  project: "M3.5 5h11v8h-11zM9 13v3M6 16h6M16.5 9h4v8h-6v-2",
  hotspot: "M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M6 18a8.5 8.5 0 0 1 0-12M18 6a8.5 8.5 0 0 1 0 12",
  notepad: "M6 3.5h12v17H6zM9 8h6M9 11.5h6M9 15h4",
};

export const CONTROLS: Control[] = [
  { id: "wifi", label: "Wi-Fi", icon: I.wifi },
  { id: "bluetooth", label: "Bluetooth", icon: I.bluetooth },
  { id: "airplane", label: "Airplane mode", icon: P.airplane },
  { id: "dnd", label: "Do not disturb", icon: I.moon },
  { id: "mic", label: "Microphone", icon: I.mic },
  { id: "dark", label: "Dark mode", icon: P.dark },
  { id: "power", label: "Power mode", icon: P.power },
  { id: "lock", label: "Lock", icon: P.lock },
  { id: "sleep", label: "Sleep", icon: P.sleep },
  { id: "restart", label: "Restart", icon: P.restart, confirm: true },
  { id: "shutdown", label: "Shut down", icon: P.shutdown, confirm: true },
  { id: "bin", label: "Empty Recycle Bin", icon: P.bin, confirm: true },
  { id: "desktop", label: "Show desktop", icon: P.desktop },
  { id: "snip", label: "Screenshot", icon: P.snip, opens: "ms-screenclip:" },
  { id: "calc", label: "Calculator", icon: P.calc, opens: "calc.exe" },
  { id: "taskmgr", label: "Task Manager", icon: P.tasks, opens: "taskmgr.exe" },
  { id: "explorer", label: "File Explorer", icon: P.folder, opens: "explorer.exe" },
  { id: "notepad", label: "Notepad", icon: P.notepad, opens: "notepad.exe" },
  { id: "settings", label: "Windows settings", icon: P.gear, opens: "ms-settings:" },
  { id: "nightlight", label: "Night light", icon: P.night, opens: "ms-settings:nightlight" },
  { id: "display", label: "Display", icon: P.desktop, opens: "ms-settings:display" },
  { id: "sound", label: "Sound output", icon: I.volume, opens: "ms-settings:sound" },
  { id: "project", label: "Project", icon: P.project, opens: "ms-settings:project" },
  { id: "hotspot", label: "Mobile hotspot", icon: P.hotspot, opens: "ms-settings:network-mobilehotspot" },
];

const POWER = ["saver", "balanced", "performance"] as const;
const POWER_NAME: Record<(typeof POWER)[number], string> = { saver: "Saver", balanced: "Balanced", performance: "Performance" };

/** Calls at most every `ms`, the last value always sent. */
function throttle(ms: number, f: (v: number) => void) {
  let last = 0;
  let timer: number | null = null;
  let pending = 0;
  return (v: number) => {
    pending = v;
    const wait = last + ms - Date.now();
    if (wait <= 0) {
      last = Date.now();
      f(v);
    } else if (timer == null) {
      timer = window.setTimeout(() => {
        timer = null;
        last = Date.now();
        f(pending);
      }, wait);
    }
  };
}

// What the browser preview shows (no Windows there).
const SAMPLE: Sound = {
  volume: 0.62,
  muted: false,
  micMuted: false,
  apps: [
    { pid: 1, name: "Spotify", volume: 0.8, muted: false, active: true },
    { pid: 2, name: "Chrome", volume: 1, muted: false, active: true },
    { pid: 3, name: "Discord", volume: 0.5, muted: true, active: false },
  ],
};

export class ControlsView {
  readonly el = el("div", "controls");
  private sound: Sound | null = null;
  private radios: Radio[] = [];
  private screens: Screen[] = [];
  private win: WinState | null = null;
  private timer: number | null = null;
  private dragging = false;
  private editing = false;
  private armed: string | null = null;
  private downloads: Download[] = [];
  private linkError = "";
  private link = el("input", "set-input dl-link");

  constructor(
    private quiet: () => boolean,
    private setQuiet: (on: boolean) => void,
    hold: (on: boolean) => void,
    private chosen: () => string[],
    private choose: (ids: string[]) => void,
  ) {
    this.link.placeholder = t("Paste a link to download");
    this.link.spellcheck = false;
    typing(this.link, hold);
    this.link.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.fetchLink();
    });
  }

  setDownloads(list: Download[]) {
    this.downloads = list;
    this.paint();
  }

  private async fetchLink() {
    const url = this.link.value.trim();
    if (!url) return;
    if (!IN_APP) {
      this.linkError = t("Downloads start in the app.");
      this.paint();
      return;
    }
    const r = await Bridge.downloadUrl(url);
    this.linkError = "error" in r ? r.error : "";
    if (!("error" in r)) this.link.value = "";
    this.paint();
  }

  /** Reads everything again; while the page is open, the sound every few seconds. */
  async open() {
    this.paint();
    await this.read(true);
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.read(false), 3000);
  }

  close() {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
    this.editing = false;
  }

  private async read(all: boolean) {
    if (this.dragging) return;
    if (!IN_APP) {
      this.sound ??= structuredClone(SAMPLE);
      if (all) {
        this.radios = [
          { kind: "wifi", on: true },
          { kind: "bluetooth", on: false },
        ];
        this.screens = [
          { id: "internal", name: "Tela do notebook", value: 70 },
          { id: "ddc:1", name: "DELL U2723QE", value: 45 },
        ];
        this.win = { dark: true, airplane: false, power: "balanced", binItems: 12, binBytes: 48_000_000 };
      }
      this.paint();
      return;
    }
    const [sound, radios, screens, win] = await Promise.all([
      Bridge.soundGet(),
      all ? Bridge.radiosGet() : null,
      all ? Bridge.brightnessList() : null,
      Bridge.winState(),
    ]);
    this.sound = sound;
    if (radios) this.radios = radios;
    if (screens) this.screens = screens;
    this.win = win;
    this.paint();
  }

  /** Whether a control is on now (null: it has no on/off). */
  private isOn(id: string): boolean | null {
    const radio = (k: Radio["kind"]) => this.radios.find((r) => r.kind === k)?.on ?? false;
    switch (id) {
      case "wifi":
      case "bluetooth":
        return radio(id);
      case "airplane":
        return this.win?.airplane ?? false;
      case "dnd":
        return this.quiet();
      case "mic":
        return this.sound?.micMuted === false;
      case "dark":
        return this.win?.dark ?? false;
      case "power":
        return this.win?.power === "performance";
      default:
        return null;
    }
  }

  private available(id: string): boolean {
    if (id === "wifi" || id === "bluetooth") return this.radios.some((r) => r.kind === id);
    if (id === "airplane") return this.win?.airplane != null;
    if (id === "mic") return this.sound?.micMuted != null;
    if (id === "dark") return this.win?.dark != null;
    if (id === "power") return this.win?.power != null;
    return true;
  }

  private label(c: Control): string {
    if (c.id === "mic") return this.sound?.micMuted ? t("Mic off") : t("Microphone");
    if (c.id === "power" && this.win?.power) return t(POWER_NAME[this.win.power]);
    if (c.id === "bin" && this.win?.binItems) return `${t("Empty Recycle Bin")} · ${size(this.win.binBytes, language())}`;
    if (this.armed === c.id) return t("Click again");
    return t(c.label);
  }

  private async act(c: Control) {
    if (c.confirm && this.armed !== c.id) {
      this.armed = c.id;
      this.paint();
      window.setTimeout(() => {
        if (this.armed === c.id) {
          this.armed = null;
          this.paint();
        }
      }, 3000);
      return;
    }
    this.armed = null;
    if (c.opens) {
      void Bridge.winAction(c.opens);
      return;
    }
    const flip = async (r: Radio | undefined) => {
      if (!r) return;
      r.on = !r.on;
      this.paint();
      if (IN_APP && !(await Bridge.radioSet(r.kind, r.on))) r.on = !r.on;
    };
    const w = this.win;
    switch (c.id) {
      case "wifi":
      case "bluetooth":
        await flip(this.radios.find((r) => r.kind === c.id));
        break;
      case "dnd":
        this.setQuiet(!this.quiet());
        break;
      case "mic":
        if (this.sound && this.sound.micMuted != null) {
          this.sound.micMuted = !this.sound.micMuted;
          void Bridge.soundSet("mic_mute", this.sound.micMuted ? 1 : 0);
        }
        break;
      case "airplane":
        if (w) {
          w.airplane = !w.airplane;
          await Bridge.winAction(`airplane:${w.airplane ? "on" : "off"}`);
          this.radios = (await Bridge.radiosGet()) ?? this.radios;
        }
        break;
      case "dark":
        if (w) {
          w.dark = !w.dark;
          void Bridge.winAction(`dark:${w.dark ? "on" : "off"}`);
        }
        break;
      case "power":
        if (w?.power) {
          w.power = POWER[(POWER.indexOf(w.power) + 1) % POWER.length];
          void Bridge.winAction(`power:${w.power}`);
        }
        break;
      case "bin":
        await Bridge.winAction("empty_bin");
        if (w) w.binItems = w.binBytes = 0;
        break;
      case "desktop":
        void Bridge.winAction("show_desktop");
        break;
      default:
        void Bridge.winAction(c.id);
    }
    this.paint();
  }

  private tile(c: Control) {
    const on = this.isOn(c.id);
    const b = el("button", `tile${on ? " on" : ""}${this.armed === c.id ? " armed" : ""}`);
    b.disabled = !this.available(c.id);
    b.title = t(c.label);
    b.append(icon(c.id === "mic" && this.sound?.micMuted ? I.micOff : c.icon, 17), el("span", "", this.label(c)));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.act(c);
    });
    return b;
  }

  private slider(path: string, value: number, set: (v: number) => void, cls = "", name = "") {
    const row = el("div", `ctl-slider ${cls}`);
    const input = el("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.value = String(Math.round(value * 100));
    input.style.setProperty("--v", `${input.value}%`);
    if (name) input.title = name;
    const send = throttle(150, (v) => set(v / 100));
    input.addEventListener("pointerdown", () => (this.dragging = true));
    input.addEventListener("pointerup", () => (this.dragging = false));
    input.addEventListener("input", () => {
      input.style.setProperty("--v", `${input.value}%`);
      send(Number(input.value));
    });
    input.addEventListener("click", (e) => e.stopPropagation());
    row.append(icon(path, 16));
    if (name) row.append(el("span", "ctl-name", name));
    row.append(input);
    return row;
  }

  /** The editor: every control, the chosen ones numbered in their order. */
  private editor() {
    const box = el("div", "ctl-edit");
    const top = el("div", "ctl-edit-top");
    top.append(el("span", "ctl-title", t("Pick the buttons, in the order you click them")));
    const done = el("button", "set-btn", t("Done"));
    done.addEventListener("click", (e) => {
      e.stopPropagation();
      this.editing = false;
      this.paint();
    });
    top.append(done);
    const grid = el("div", "ctl-catalog");
    const chosen = this.chosen();
    for (const c of CONTROLS) {
      const n = chosen.indexOf(c.id);
      const b = el("button", `cat-item${n >= 0 ? " on" : ""}`);
      b.append(icon(c.icon, 15), el("span", "", t(c.label)));
      if (n >= 0) b.append(el("i", "cat-n", String(n + 1)));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.choose(n >= 0 ? chosen.filter((x) => x !== c.id) : [...chosen, c.id]);
        this.paint();
      });
      grid.append(b);
    }
    box.append(top, grid);
    return box;
  }

  paint() {
    // Not while a slider is held or a link is being typed (it would lose the focus).
    if (this.dragging || document.activeElement === this.link) return;
    this.el.replaceChildren();
    if (this.editing) {
      this.el.append(this.editor());
      return;
    }
    const s = this.sound;
    const left = el("div", "ctl-left");
    const head = el("div", "ctl-head");
    const edit = el("button", "set-btn quiet", t("Edit"));
    edit.addEventListener("click", (e) => {
      e.stopPropagation();
      this.editing = true;
      this.paint();
    });
    head.append(el("span", "ctl-title", t("Controls")), edit);
    const tiles = el("div", "tiles");
    for (const id of this.chosen()) {
      const c = CONTROLS.find((x) => x.id === id);
      if (c) tiles.append(this.tile(c));
    }
    left.append(head, tiles);
    for (const scr of this.screens) {
      left.append(
        this.slider(I.sun, scr.value / 100, (v) => {
          scr.value = Math.round(v * 100);
          void Bridge.brightnessSet(scr.id, scr.value);
        }, "", this.screens.length > 1 ? scr.name : ""),
      );
    }
    if (s && s.volume >= 0) {
      const vol = this.slider(s.muted ? I.muted : I.volume, s.volume, (v) => {
        s.volume = v;
        void Bridge.soundSet("volume", v);
      });
      vol.querySelector("svg")!.addEventListener("click", (e) => {
        e.stopPropagation();
        s.muted = !s.muted;
        void Bridge.soundSet("mute", s.muted ? 1 : 0);
        this.paint();
      });
      vol.classList.add("mutable");
      left.append(vol);
    }

    const right = el("div", "ctl-apps");
    right.append(el("div", "ctl-title", t("Volume by app")));
    if (!s?.apps.length) right.append(el("p", "set-note", t("No app is making sound.")));
    for (const a of s?.apps ?? []) {
      const row = el("div", `app-vol${a.active ? " active" : ""}`);
      const mute = el("button", "app-mute");
      mute.title = a.muted ? t("Unmute") : t("Mute");
      mute.append(icon(a.muted ? I.muted : I.volume, 14));
      mute.addEventListener("click", (e) => {
        e.stopPropagation();
        a.muted = !a.muted;
        void Bridge.soundSet("app_mute", a.muted ? 1 : 0, a.pid);
        this.paint();
      });
      const sl = this.slider(I.volume, a.volume, (v) => {
        a.volume = v;
        void Bridge.soundSet("app_volume", v, a.pid);
      }, "bare");
      sl.querySelector("svg")?.remove();
      row.append(el("span", "app-name", a.name), sl, mute);
      right.append(row);
    }

    // Downloads: a link to fetch, and what is downloading.
    const dl = el("div", "ctl-dl");
    dl.append(el("div", "ctl-title", t("Downloads")));
    const go = el("button", "set-btn", t("Download"));
    go.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.fetchLink();
    });
    const row = el("div", "ctl-dl-row");
    row.append(this.link, go);
    dl.append(row);
    if (this.linkError) dl.append(el("p", "set-note error", this.linkError));
    for (const d of this.downloads) {
      const item = el("div", `dl-item${d.state === "done" ? " done" : ""}`);
      const bar = el("div", "dl-bar");
      const fill = el("div", "dl-fill");
      const p = percent(d);
      fill.style.width = p == null ? "35%" : `${p}%`;
      if (p == null) fill.classList.add("indeterminate");
      bar.append(fill);
      item.append(el("span", "dl-name", d.name), bar, el("span", "dl-text", progressText(d, language())));
      dl.append(item);
    }
    right.append(dl);
    this.el.append(left, right);
  }
}
