// The settings page, inside the island: the assistant (Claude and Gemini:
// key or subscription, the model), notifications, the island's look.
// The keys go straight to Windows' Credential Manager; this page only learns
// whether one is saved.

import { Bridge, IN_APP, type CcStatus, type SecretName } from "../core/bridge.ts";
import type { Session } from "../claude-code/sessions.ts";
import { t } from "../core/i18n.ts";
import type { Provider, Settings } from "../core/settings.ts";
import { el, typing } from "../island/dom.ts";
import { ago, type Notice } from "../notify/notices.ts";
import { language } from "../core/i18n.ts";

type Tab = "assistant" | "claude" | "notifications" | "island";

const SECRET: Record<Provider, SecretName> = { claude: "anthropic", gemini: "gemini" };
const AI: { id: Provider; name: string; keyHint: string; model: string; cli: string }[] = [
  { id: "claude", name: "Claude", keyHint: "sk-ant-…", model: "claude-opus-5-5", cli: "Claude Code (claude)" },
  { id: "gemini", name: "Gemini", keyHint: "AIza…", model: "gemini-2.5-flash", cli: "Gemini CLI (gemini)" },
];

export class SettingsView {
  readonly el = el("div", "settings");
  private tab: Tab = "assistant";
  private hasKey: Partial<Record<Provider, boolean>> = {};

  constructor(
    private settings: () => Settings,
    private change: (s: Partial<Settings>) => void,
    private recent: () => readonly Notice[],
    private sessions: () => readonly Session[],
    private hold: (on: boolean) => void,
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
    for (const [id, label] of [["assistant", "Assistant"], ["claude", "Claude Code"], ["notifications", "Notifications"], ["island", "Island"]] as [Tab, string][]) {
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

  private island(body: HTMLElement) {
    const s = this.settings();
    const i = s.island;
    const setI = (p: Partial<typeof i>) => this.change({ island: { ...i, ...p } });
    const box = el("div", "set-box");
    const scale = el("input", "set-range");
    scale.type = "range";
    scale.min = "0.8";
    scale.max = "1.4";
    scale.step = "0.05";
    scale.value = String(i.scale);
    scale.addEventListener("change", () => setI({ scale: Number(scale.value) }));
    box.append(
      this.row(t("Shape"), this.segmented(i.shape, [["notch", t("Notch")], ["floating", t("Floating")]], (shape) => setI({ shape }))),
      this.row(t("At rest"), this.segmented(i.rest, [["small", t("Small")], ["medium", t("Medium")]], (rest) => setI({ rest }))),
      this.row(t("Size"), scale),
    );
    body.append(box);
  }
}
