// The assistant's page: Kumo on the left, the conversation and the question
// on the right, Claude or Gemini to pick on top.

import { Bridge, IN_APP, on } from "../core/bridge.ts";
import { t } from "../core/i18n.ts";
import type { Provider, Settings } from "../core/settings.ts";
import { Canvas, el, icon, typing } from "../island/dom.ts";
import type { Kumo } from "../mascot/kumo.ts";
import { EMPTY, ask, delta, done, moodOf, toSend, type Conversation } from "./conversation.ts";

const SEND = "M5 12h13M13 6l6 6-6 6";
const STOP = "M7 7h10v10H7z";
const NEW = "M12 5v14M5 12h14";

const NAMES: Record<Provider, string> = { claude: "Claude", gemini: "Gemini" };

export class ChatView {
  readonly el = el("div", "chat");
  private kumoCanvas: Canvas;
  private list = el("div", "chat-list");
  private input = el("textarea", "chat-input");
  private sendBtn = el("button", "chat-send");
  private chips = el("div", "chat-chips");
  private c: Conversation = EMPTY;
  private calm: number | null = null;

  constructor(
    private kumo: Kumo,
    private settings: () => Settings,
    private change: (s: Partial<Settings>) => void,
    hold: (on: boolean) => void,
  ) {
    this.kumoCanvas = new Canvas(96, 110, "chat-kumo", (x) => kumo.draw(x, 96, 110, 60));
    const side = el("div", "chat-side");
    side.append(this.kumoCanvas.el, this.chips);

    const main = el("div", "chat-main");
    const row = el("div", "chat-row");
    this.input.rows = 1;
    this.input.placeholder = t("Ask Kumo…");
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.send();
      } else if (e.key === "Escape") {
        this.stop();
        this.input.blur();
      }
    });
    this.input.addEventListener("input", () => this.fit());
    typing(this.input, hold);
    this.sendBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.c.pending) this.stop();
      else this.send();
    });
    const fresh = el("button", "chat-new");
    fresh.title = t("New conversation");
    fresh.append(icon(NEW, 15));
    fresh.addEventListener("click", (e) => {
      e.stopPropagation();
      this.stop();
      this.c = EMPTY;
      this.paint();
    });
    row.append(fresh, this.input, this.sendBtn);
    main.append(this.list, row);
    this.el.append(side, main);

    on<{ id: string; text: string }>("chat-delta", (p) => this.set(delta(this.c, p.id, p.text)));
    on<{ id: string; error: string | null; refused: boolean }>("chat-done", (p) => this.set(done(this.c, p.id, p.error, p.refused)));
    this.paint();
  }

  /** Draws Kumo; the island calls it every frame while the page is open. */
  frame() {
    this.kumoCanvas.draw();
  }

  focus() {
    window.setTimeout(() => this.input.focus(), 60);
  }

  private fit() {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(72, this.input.scrollHeight)}px`;
  }

  private send() {
    const text = this.input.value;
    const s = this.settings();
    const id = crypto.randomUUID();
    const next = ask(this.c, text, id, s.provider);
    if (next === this.c) return;
    this.input.value = "";
    this.fit();
    this.set(next);
    const prefs = s.ai[s.provider];
    if (IN_APP) {
      void Bridge.chatSend({ id, provider: s.provider, mode: prefs.mode, model: prefs.model || null, turns: toSend(next) });
    } else {
      void this.pretend(id);
    }
  }

  private stop() {
    const id = this.c.pending;
    if (!id) return;
    void Bridge.chatCancel(id);
    this.set(done(this.c, id, null, false));
  }

  /** In a plain browser there is no AI: Kumo says so, as if streaming. */
  private async pretend(id: string) {
    await new Promise((r) => setTimeout(r, 700));
    const words = t("In the browser preview I can't reach the AIs. In the Manga app, I answer with Claude or Gemini.").split(" ");
    for (const w of words) {
      await new Promise((r) => setTimeout(r, 45));
      this.set(delta(this.c, id, `${w} `));
    }
    this.set(done(this.c, id, null, false));
  }

  private set(c: Conversation) {
    if (c === this.c) return;
    this.c = c;
    this.kumo.setMood(moodOf(c.phase));
    if (this.calm != null) window.clearTimeout(this.calm);
    if (c.phase === "done" || c.phase === "error" || c.phase === "refused") {
      this.calm = window.setTimeout(() => this.kumo.setMood("idle"), 3500);
    }
    this.paint();
  }

  /** Re-reads the settings (the chosen AI). */
  paint() {
    const s = this.settings();
    this.chips.replaceChildren();
    for (const p of ["claude", "gemini"] as Provider[]) {
      const b = el("button", `chip${s.provider === p ? " on" : ""}`, NAMES[p]);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.change({ provider: p });
        this.paint();
      });
      this.chips.append(b);
    }

    this.list.replaceChildren();
    if (!this.c.turns.length) {
      const hello = el("div", "chat-hello");
      hello.append(el("b", "", t("Hi! I'm {name}.", { name: "Kumo" })), el("span", "", t("Ask me anything. I answer with {ai}.", { ai: NAMES[s.provider] })));
      this.list.append(hello);
    }
    for (const turn of this.c.turns) {
      const b = el("div", `msg ${turn.role}${turn.error ? " error" : ""}`);
      if (turn.role === "assistant" && turn.text === "") b.append(el("span", "dots", "···"));
      else b.textContent = turn.text;
      if (turn.role === "assistant" && turn.provider) b.dataset.by = NAMES[turn.provider];
      this.list.append(b);
    }
    this.list.scrollTop = this.list.scrollHeight;
    this.sendBtn.replaceChildren(icon(this.c.pending ? STOP : SEND, 15));
    this.sendBtn.title = this.c.pending ? t("Stop") : t("Send");
  }
}
