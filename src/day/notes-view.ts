// Notes and tasks: a list of notes with the one being written beside it;
// the tasks with their dates, done ones crossed out.

import { language, t } from "../core/i18n.ts";
import { el, icon, typing } from "../island/dom.ts";
import { noteTitle } from "./day.ts";
import type { DayStore } from "./store.ts";

const PLUS = "M12 5v14M5 12h14";
const TRASH = "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12";

export class NotesView {
  readonly el = el("div", "notes");
  tab: "notes" | "tasks" = "notes";
  private current: string | null = null;
  private editor = el("textarea", "note-editor");
  private taskInput = el("input", "set-input");
  private taskDue = el("input", "set-input task-due");

  constructor(
    private day: DayStore,
    hold: (on: boolean) => void,
  ) {
    this.editor.placeholder = t("Write here. The first line is the title.");
    this.editor.spellcheck = true;
    typing(this.editor, hold);
    this.editor.addEventListener("input", () => {
      if (this.current) day.editNote(this.current, this.editor.value);
      const item = this.el.querySelector<HTMLElement>(`.note-item[data-id="${this.current}"] b`);
      if (item) item.textContent = noteTitle({ id: "", text: this.editor.value, updated: 0 }) || t("New note");
    });
    this.taskInput.placeholder = t("New task…");
    this.taskDue.type = "date";
    typing(this.taskInput, hold);
    typing(this.taskDue, hold);
    this.taskInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && this.taskInput.value.trim()) {
        day.addTask(this.taskInput.value, this.taskDue.value);
        this.taskInput.value = "";
        this.paint();
      }
    });
    day.onChange(() => {
      if (this.el.isConnected && !this.el.contains(document.activeElement)) this.paint();
    });
  }

  private btn(path: string, label: string, act: () => void) {
    const b = el("button", "f-btn small");
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
    for (const [id, label] of [["notes", "Notes"], ["tasks", "Tasks"]] as const) {
      const b = el("button", `f-tab${this.tab === id ? " on" : ""}`, t(label));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.tab = id;
        this.paint();
      });
      tabs.append(b);
    }
    const body = el("div", "notes-body");
    if (this.tab === "notes") this.notes(body, tabs);
    else this.tasks(body);
    this.el.append(tabs, body);
  }

  private notes(body: HTMLElement, tabs: HTMLElement) {
    const d = this.day;
    tabs.append(el("span", "m-gap"), this.btn(PLUS, t("New note"), () => {
      this.current = d.addNote().id;
      this.paint();
      this.editor.focus();
    }));
    if (!this.current || !d.notes.some((n) => n.id === this.current)) this.current = d.notes[0]?.id ?? null;
    const list = el("div", "note-list");
    for (const n of d.notes) {
      const item = el("button", `note-item${n.id === this.current ? " on" : ""}`);
      item.dataset.id = n.id;
      item.append(el("b", "", noteTitle(n) || t("New note")), el("span", "", n.updated ? new Date(n.updated).toLocaleDateString(language(), { day: "numeric", month: "short" }) : ""));
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        this.current = n.id;
        this.paint();
      });
      list.append(item);
    }
    if (!d.notes.length) list.append(el("p", "set-note", t("No notes yet.")));
    const right = el("div", "note-right");
    const note = d.notes.find((n) => n.id === this.current);
    if (note) {
      this.editor.value = note.text;
      const del = this.btn(TRASH, t("Remove"), () => {
        d.removeNote(note.id);
        this.current = null;
        this.paint();
      });
      del.classList.add("note-del");
      right.append(this.editor, del);
    }
    body.append(list, right);
  }

  private tasks(body: HTMLElement) {
    const d = this.day;
    const list = el("div", "task-list");
    const today = new Date().toISOString().slice(0, 10);
    for (const task of d.tasks) {
      const row = el("div", `task${task.done ? " done" : ""}${task.due && task.due < today && !task.done ? " late" : ""}`);
      const box = el("input");
      box.type = "checkbox";
      box.checked = task.done;
      box.addEventListener("click", (e) => e.stopPropagation());
      box.addEventListener("change", () => d.toggleTask(task.id));
      const due = task.due ? new Date(`${task.due}T12:00`).toLocaleDateString(language(), { day: "numeric", month: "short" }) : "";
      row.append(box, el("span", "task-text", task.text), el("span", "task-when", due), this.btn(TRASH, t("Remove"), () => d.removeTask(task.id)));
      list.append(row);
    }
    if (!d.tasks.length) list.append(el("p", "set-note", t("No tasks. Add one below.")));
    const add = el("div", "f-link-add");
    const go = el("button", "set-btn", t("Add"));
    go.addEventListener("click", (e) => {
      e.stopPropagation();
      this.taskInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    add.append(this.taskInput, this.taskDue, go);
    if (d.tasks.some((x) => x.done)) {
      const clear = el("button", "set-btn quiet", t("Clear done"));
      clear.addEventListener("click", (e) => {
        e.stopPropagation();
        d.removeTask(null);
      });
      add.append(clear);
    }
    body.append(list, add);
    body.classList.add("col");
  }
}
