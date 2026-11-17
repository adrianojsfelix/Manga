// The notifications that arrived, newest first: open from the bell.

import { language, t } from "../core/i18n.ts";
import { el, icon } from "../island/dom.ts";
import { I } from "../island/icons.ts";
import { ago, appColor, type Notice } from "./notices.ts";

export class InboxView {
  readonly el = el("div", "inbox");

  constructor(
    private list: () => readonly Notice[],
    private remove: (id: number | null) => void,
    private hideApp: (app: string) => void,
  ) {}

  paint() {
    this.el.replaceChildren();
    const items = this.list();
    const top = el("div", "inbox-top");
    top.append(el("b", "", t("Notifications")), el("span", "inbox-count", String(items.length)));
    if (items.length) {
      const clear = el("button", "set-btn quiet", t("Clear all"));
      clear.addEventListener("click", (e) => {
        e.stopPropagation();
        this.remove(null);
      });
      top.append(clear);
    }
    const scroll = el("div", "inbox-list");
    if (!items.length) scroll.append(el("p", "set-note", t("No notifications yet.")));
    const now = Date.now();
    for (const n of items) {
      const row = el("div", "inbox-row");
      const badge = el("span", "inbox-badge", (n.app.trim()[0] ?? "?").toUpperCase());
      badge.style.background = appColor(n.app);
      const text = el("div", "notice-text");
      text.append(el("b", "", n.title || n.app), el("span", "", n.body));
      const meta = el("div", "notice-meta");
      meta.append(el("span", "", `${n.app} · ${ago(n.at, now, language())}`));
      const actions = el("span", "inbox-actions");
      const hide = el("button", "set-btn quiet", t("Hide app"));
      hide.addEventListener("click", (e) => {
        e.stopPropagation();
        this.hideApp(n.app);
      });
      const x = el("button", "app-mute");
      x.title = t("Dismiss");
      x.append(icon(I.close, 13));
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        this.remove(n.id);
      });
      actions.append(hide, x);
      meta.append(actions);
      row.append(badge, text, meta);
      scroll.append(row);
    }
    this.el.append(top, scroll);
  }
}
