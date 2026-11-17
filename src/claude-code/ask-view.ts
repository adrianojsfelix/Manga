// What Claude Code waits for on the island: a permission (Allow / Deny / in
// the terminal) or Claude's questions (the options, or another answer).

import { Bridge, type CcAnswer } from "../core/bridge.ts";
import { t } from "../core/i18n.ts";
import { el, typing } from "../island/dom.ts";
import { answers, permissionDetail, project, questions, type CcAsk, type Question } from "./sessions.ts";

export class AskView {
  readonly el = el("div", "ask");
  private queue: CcAsk[] = [];
  private picked: string[][] = [];
  private step = 0;

  constructor(
    private changed: () => void,
    private hold: (on: boolean) => void,
  ) {}

  get current(): CcAsk | null {
    return this.queue[0] ?? null;
  }

  add(a: CcAsk) {
    this.queue.push(a);
    if (this.queue.length === 1) this.reset();
    this.changed();
  }

  /** Answered elsewhere (the terminal, a timeout). */
  gone(id: number) {
    const first = this.queue[0]?.id === id;
    this.queue = this.queue.filter((a) => a.id !== id);
    if (first) this.reset();
    this.changed();
  }

  private reset() {
    this.picked = [];
    this.step = 0;
  }

  private answer(a: CcAnswer) {
    const cur = this.queue.shift();
    if (!cur) return;
    void Bridge.ccAnswer(cur.id, a);
    this.reset();
    this.hold(false);
    this.changed();
  }

  private button(label: string, cls: string, act: () => void) {
    const b = el("button", `ask-btn ${cls}`, label);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      act();
    });
    return b;
  }

  private painted = "";

  /** Redraws when what it shows changed (a field being typed in stays). */
  paint() {
    const a = this.current;
    const key = a ? `${a.id}|${this.step}|${JSON.stringify(this.picked)}|${this.queue.length}` : "";
    if (key === this.painted) return;
    this.painted = key;
    this.el.replaceChildren();
    if (!a) return;
    const more = this.queue.length > 1 ? ` · +${this.queue.length - 1}` : "";
    if (a.kind === "permission") {
      const top = el("div", "ask-top");
      top.append(el("span", "ask-badge", "Claude Code"), el("span", "ask-project", `${project(a.cwd)}${more}`));
      const title = el("div", "ask-title", t("{project} wants to use {tool}", { project: project(a.cwd), tool: a.tool }));
      const detail = permissionDetail(a.tool, a.input);
      const row = el("div", "ask-row");
      row.append(
        this.button(t("In the terminal"), "quiet", () => this.answer({ choice: "terminal" })),
        this.button(t("Deny"), "deny", () => this.answer({ choice: "deny" })),
        this.button(t("Allow"), "allow", () => this.answer({ choice: "allow" })),
      );
      this.el.append(top, title);
      if (detail) this.el.append(el("pre", "ask-detail", detail));
      this.el.append(row);
      return;
    }

    const qs = questions(a.input);
    if (!qs.length) {
      this.answer({ choice: "terminal" });
      return;
    }
    const q: Question = qs[Math.min(this.step, qs.length - 1)];
    const top = el("div", "ask-top");
    top.append(el("span", "ask-badge", t("Claude asks")), el("span", "ask-project", `${project(a.cwd)}${more}`));
    if (qs.length > 1) top.append(el("span", "ask-step", t("Question {n} of {total}", { n: this.step + 1, total: qs.length })));
    if (q.header) top.append(el("span", "ask-header", q.header));
    this.el.append(top, el("div", "ask-title", q.question));

    const chosen = this.picked[this.step] ?? [];
    const go = (pick: string[]) => {
      this.picked[this.step] = pick;
      if (this.step < qs.length - 1) {
        this.step++;
        this.changed();
        return;
      }
      const ans = answers(qs, this.picked);
      if (ans) this.answer({ choice: "answers", answers: ans });
    };
    const opts = el("div", "ask-options");
    for (const o of q.options) {
      const b = el("button", `ask-option${chosen.includes(o.label) ? " on" : ""}`);
      b.append(el("b", "", o.label));
      if (o.description) b.append(el("span", "", o.description));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!q.multiSelect) return go([o.label]);
        const now = chosen.includes(o.label) ? chosen.filter((x) => x !== o.label) : [...chosen, o.label];
        this.picked[this.step] = now;
        this.changed();
      });
      opts.append(b);
    }
    this.el.append(opts);

    const row = el("div", "ask-row");
    const other = el("input", "ask-other");
    other.placeholder = t("Other answer…");
    typing(other, this.hold);
    other.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && other.value.trim()) go([other.value.trim()]);
    });
    row.append(other, this.button(t("In the terminal"), "quiet", () => this.answer({ choice: "terminal" })));
    if (q.multiSelect) row.append(this.button(t("Answer"), "allow", () => (other.value.trim() ? go([...chosen, other.value.trim()]) : chosen.length && go(chosen))));
    this.el.append(row);
  }
}
