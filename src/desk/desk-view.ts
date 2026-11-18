// The Windows page: the apps open (switch, minimize, close) and pinned on
// the taskbar (open); the clipboard's history (click to copy again); the
// shelf of files dropped on the island; the keyboard layouts and the
// Recycle Bin.

import { Bridge, IN_APP, type AppWindow, type Clip, type Keyboard, type WinState } from "../core/bridge.ts";
import { language, t } from "../core/i18n.ts";
import { ago } from "../notify/notices.ts";
import { el, icon } from "../island/dom.ts";
import { I } from "../island/icons.ts";
import { size } from "../system/activity.ts";
import { clipPreview, extension, type ShelfItem } from "./shelf.ts";

export type DeskTab = "apps" | "clip" | "shelf" | "more";

const MIN = "M5 12h14";
const COPY = "M8 8h11v12H8zM5 16V4h11";
const TRASH = "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12";

const icons = new Map<string, string | null>();

/** A file's (or app's) icon, fetched once. */
function iconEl(path: string, cls: string, fallback: string): HTMLElement {
  const e = el("span", cls, fallback);
  const known = icons.get(path);
  if (known) {
    e.textContent = "";
    e.style.backgroundImage = `url("${known}")`;
  } else if (known === undefined && IN_APP && path) {
    icons.set(path, null);
    void Bridge.fileIcon(path).then((src) => {
      icons.set(path, src);
      if (src) {
        e.textContent = "";
        e.style.backgroundImage = `url("${src}")`;
      }
    });
  }
  return e;
}

// What the browser preview shows (no Windows there).
const SAMPLE_APPS: AppWindow[] = [
  { id: 1, title: "Manga — Visual Studio Code", app: "Code", exe: "", active: true, minimized: false },
  { id: 2, title: "Lofi Girl - YouTube — Google Chrome", app: "Chrome", exe: "", active: false, minimized: false },
  { id: 3, title: "Spotify Premium", app: "Spotify", exe: "", active: false, minimized: true },
  { id: 4, title: "Downloads", app: "Explorer", exe: "", active: false, minimized: false },
];
const SAMPLE_CLIPS: Clip[] = [
  { id: 3, kind: "text", text: "https://github.com/adrianojsfelix/Manga", thumb: "", at: Date.now() - 60_000 },
  { id: 2, kind: "text", text: "Reunião confirmada para quinta às 15h, sala 2.", thumb: "", at: Date.now() - 600_000 },
  { id: 1, kind: "text", text: "npm run tauri dev", thumb: "", at: Date.now() - 3_600_000 },
];

export class DeskView {
  readonly el = el("div", "desk");
  tab: DeskTab = "apps";
  private apps: AppWindow[] = [];
  private pinned: { name: string; path: string }[] = [];
  private clips: Clip[] = [];
  private keyboard: Keyboard | null = null;
  private win: WinState | null = null;
  private timer: number | null = null;
  private note = "";

  constructor(
    private shelf: () => ShelfItem[],
    private setShelf: (s: ShelfItem[]) => void,
    private clipOn: () => boolean,
    private setClipOn: (on: boolean) => void,
  ) {}

  async open() {
    this.paint();
    await this.read();
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => void this.read(), 2500);
  }

  close() {
    if (this.timer != null) window.clearInterval(this.timer);
    this.timer = null;
  }

  /** The clipboard changed (an event from Rust). */
  async clipboardChanged() {
    if (this.el.isConnected && this.tab === "clip") await this.read();
  }

  async read() {
    if (!IN_APP) {
      this.apps = SAMPLE_APPS;
      this.pinned = [{ name: "Chrome", path: "" }, { name: "Explorador de Arquivos", path: "" }, { name: "Spotify", path: "" }, { name: "Visual Studio Code", path: "" }];
      this.clips = this.clipOn() ? SAMPLE_CLIPS : [];
      this.keyboard = { layouts: [{ id: 1, locale: "pt-BR", short: "PT", name: "Português (Brasil)" }, { id: 2, locale: "en-US", short: "EN", name: "Inglês (Estados Unidos)" }], current: this.keyboard?.current ?? 1 };
      this.win = { dark: true, airplane: false, power: "balanced", binItems: 12, binBytes: 48_000_000 };
    } else {
      const [apps, pinned, clips, keyboard, win] = await Promise.all([Bridge.appsOpen(), Bridge.appsPinned(), Bridge.clipboardHistory(), Bridge.keyboardGet(), Bridge.winState()]);
      this.apps = apps ?? [];
      this.pinned = pinned ?? [];
      this.clips = clips ?? [];
      this.keyboard = keyboard;
      this.win = win;
    }
    if (this.el.isConnected) this.paint();
  }

  private btn(path: string, label: string, act: () => void, cls = "f-btn small") {
    const b = el("button", cls);
    b.title = label;
    b.append(icon(path, 14));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      act();
    });
    return b;
  }

  paint() {
    this.el.replaceChildren();
    const tabs = el("div", "f-tabs");
    for (const [id, label] of [
      ["apps", "Apps"],
      ["clip", "Clipboard"],
      ["shelf", "Shelf"],
      ["more", "Keyboard and bin"],
    ] as [DeskTab, string][]) {
      const b = el("button", `f-tab${this.tab === id ? " on" : ""}`, t(label));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.tab = id;
        this.note = "";
        this.paint();
      });
      tabs.append(b);
    }
    const body = el("div", "desk-body");
    if (this.tab === "apps") this.appsTab(body);
    else if (this.tab === "clip") this.clipTab(body, tabs);
    else if (this.tab === "shelf") this.shelfTab(body, tabs);
    else this.moreTab(body);
    this.el.append(tabs, body);
    if (this.note) this.el.append(el("p", "set-note", this.note));
  }

  private appsTab(body: HTMLElement) {
    const open = el("div", "desk-apps");
    for (const a of this.apps) {
      const row = el("div", `desk-app${a.active ? " active" : ""}${a.minimized ? " min" : ""}`);
      row.title = a.title;
      const main = el("button", "desk-app-main");
      main.append(iconEl(a.exe, "desk-icon", (a.app[0] ?? "?").toUpperCase()), el("span", "desk-app-text", a.title));
      main.addEventListener("click", (e) => {
        e.stopPropagation();
        void Bridge.appWindow(a.id, "activate");
      });
      row.append(
        main,
        this.btn(MIN, t("Minimize"), () => void Bridge.appWindow(a.id, "minimize").then(() => this.read())),
        this.btn(I.close, t("Close"), () => void Bridge.appWindow(a.id, "close").then(() => window.setTimeout(() => void this.read(), 400))),
      );
      open.append(row);
    }
    if (!this.apps.length) open.append(el("p", "set-note", t("No windows open.")));
    const pins = el("div", "desk-pins");
    pins.append(el("span", "ctl-title", t("Pinned")));
    const grid = el("div", "desk-pin-grid");
    for (const p of this.pinned) {
      const b = el("button", "desk-pin");
      b.title = p.name;
      b.append(iconEl(p.path, "desk-icon big", (p.name[0] ?? "?").toUpperCase()), el("span", "", p.name));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        void Bridge.appLaunch(p.path);
      });
      grid.append(b);
    }
    if (!this.pinned.length) grid.append(el("p", "set-note", t("Nothing pinned on the taskbar.")));
    pins.append(grid);
    body.append(open, pins);
  }

  private clipTab(body: HTMLElement, tabs: HTMLElement) {
    const on = this.clipOn();
    const sw = el("button", `switch${on ? " on" : ""}`);
    sw.title = on ? t("Keeping the history") : t("History off");
    sw.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setClipOn(!on);
      this.clips = [];
      this.paint();
    });
    tabs.append(el("span", "m-gap"), el("span", "set-note", t("History")), sw);
    if (on && this.clips.length) {
      const clear = el("button", "set-btn quiet", t("Clear all"));
      clear.addEventListener("click", (e) => {
        e.stopPropagation();
        void Bridge.clipboardClear();
        this.clips = [];
        this.paint();
      });
      tabs.append(clear);
    }
    const list = el("div", "clips");
    if (!on) list.append(el("p", "set-note", t("The history is off. When on, what you copy stays here (in memory only, never saved), except what password managers mark as private.")));
    else if (!this.clips.length) list.append(el("p", "set-note", t("Copy something and it shows here.")));
    const now = Date.now();
    for (const c of this.clips) {
      const b = el("button", `cb-item ${c.kind}`);
      if (c.kind === "image") {
        const img = el("span", "clip-img");
        img.style.backgroundImage = `url("${c.thumb}")`;
        b.append(img, el("span", "clip-text", `${t("Picture")} ${c.text}`));
      } else b.append(el("span", "clip-text", clipPreview(c.text)));
      b.append(el("span", "clip-when", ago(c.at, now, language())));
      b.title = t("Click to copy again");
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await Bridge.clipboardUse(c.id);
        this.note = ok || !IN_APP ? t("Copied. Paste it with Ctrl+V.") : "";
        this.paint();
      });
      list.append(b);
    }
    body.append(list);
  }

  private shelfTab(body: HTMLElement, tabs: HTMLElement) {
    const items = this.shelf();
    if (items.length) {
      const copyAll = el("button", "set-btn quiet", t("Copy all"));
      copyAll.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await Bridge.copyFiles(items.map((x) => x.path));
        this.note = ok ? t("Copied. Paste the files with Ctrl+V in any folder.") : "";
        this.paint();
      });
      const clear = el("button", "set-btn quiet", t("Empty the shelf"));
      clear.addEventListener("click", (e) => {
        e.stopPropagation();
        this.setShelf([]);
        this.paint();
      });
      tabs.append(el("span", "m-gap"), copyAll, clear);
    }
    const grid = el("div", "shelf");
    if (!items.length) {
      const hint = el("div", "shelf-empty");
      hint.append(icon(I.download, 28), el("b", "", t("Drop files on the island")), el("span", "", t("They wait here: open, show in their folder, or copy to paste elsewhere.")));
      grid.append(hint);
    }
    for (const f of items) {
      const card = el("div", "shelf-item");
      card.title = f.path;
      const ic = iconEl(f.path, "desk-icon big", extension(f.name) || "📄");
      const open = el("button", "shelf-open");
      open.append(ic, el("span", "shelf-name", f.name));
      open.addEventListener("click", (e) => {
        e.stopPropagation();
        void Bridge.openPath(f.path);
      });
      const acts = el("span", "shelf-acts");
      acts.append(
        this.btn(I.folder, t("Folder"), () => void Bridge.openPath(f.path, true)),
        this.btn(COPY, t("Copy"), () => void Bridge.copyFiles([f.path]).then((ok) => ((this.note = ok ? t("Copied. Paste the files with Ctrl+V in any folder.") : ""), this.paint()))),
        this.btn(TRASH, t("Remove"), () => {
          this.setShelf(items.filter((x) => x.path !== f.path));
          this.paint();
        }),
      );
      card.append(open, acts);
      grid.append(card);
    }
    body.append(grid);
  }

  private moreTab(body: HTMLElement) {
    const kb = el("div", "set-box desk-kb");
    kb.append(el("div", "set-title", t("Keyboard")));
    const chips = el("div", "set-chips");
    for (const l of this.keyboard?.layouts ?? []) {
      const b = el("button", `chip${l.id === this.keyboard?.current ? " on" : ""}`);
      b.append(el("b", "", l.short), document.createTextNode(` ${l.name}`));
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        await Bridge.keyboardSet(l.id);
        if (this.keyboard) this.keyboard.current = l.id;
        this.paint();
      });
      chips.append(b);
    }
    kb.append(chips, el("p", "set-note", t("Switches the layout of the window you were using. Win+Space does it too.")));
    const bin = el("div", "set-box desk-bin");
    bin.append(el("div", "set-title", t("Recycle Bin")));
    const w = this.win;
    bin.append(el("p", "", w?.binItems ? t("{n} items · {size}", { n: w.binItems, size: size(w.binBytes, language()) }) : t("Empty")));
    const row = el("div", "f-row");
    const open = el("button", "set-btn quiet", t("Open"));
    open.addEventListener("click", (e) => {
      e.stopPropagation();
      void Bridge.winAction("shell:RecycleBinFolder");
    });
    const empty = el("button", "set-btn", t("Empty Recycle Bin"));
    empty.disabled = !w?.binItems;
    let armed = false;
    empty.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!armed) {
        armed = true;
        empty.textContent = t("Click again");
        return;
      }
      await Bridge.winAction("empty_bin");
      if (this.win) this.win.binItems = this.win.binBytes = 0;
      this.paint();
    });
    row.append(open, empty);
    bin.append(row);
    body.append(kb, bin);
  }
}
