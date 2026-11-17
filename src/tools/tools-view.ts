// Quick utilities: a calculator, currency quotes (dollar, euro, bitcoin…),
// a mini news portal and a mini portal of the user's Pinterest boards.

import { Bridge, IN_APP } from "../core/bridge.ts";
import { language, t } from "../core/i18n.ts";
import { ago } from "../notify/notices.ts";
import { el, icon, typing } from "../island/dom.ts";
import { calculate, showNumber } from "./calc.ts";
import { QUOTES_URL, parseFeed, parseQuotes, pinterestFeed, type FeedItem, type Quote } from "./feeds.ts";

type Tab = "calc" | "quotes" | "news" | "pins";

const REFRESH = "M5 12a7 7 0 1 0 2.1-5M5 4.5V8h3.5";
const TRASH = "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12";

// What the browser preview shows (no internet from there).
const SAMPLE_QUOTES: Quote[] = [
  { code: "USD", name: "Dólar Americano", value: 5.31, change: -0.42 },
  { code: "EUR", name: "Euro", value: 6.12, change: 0.18 },
  { code: "BTC", name: "Bitcoin", value: 498_320, change: 2.7 },
  { code: "ETH", name: "Ethereum", value: 17_850, change: 1.1 },
];

export interface ToolsPrefs {
  feeds: string[];
  pins: string[];
}

export class ToolsView {
  readonly el = el("div", "tools");
  private tab: Tab = "calc";
  private expr = el("input", "calc-input");
  private history: { expr: string; result: string }[] = [];
  private quotes: Quote[] = [];
  private quotesAt = 0;
  private amount = el("input", "set-input");
  private news: FeedItem[] = [];
  private pins: FeedItem[] = [];
  private loading = "";
  private error = "";
  private newFeed = el("input", "set-input");
  private newPin = el("input", "set-input");
  private editing = false;

  constructor(
    private prefs: () => ToolsPrefs,
    private setPrefs: (p: ToolsPrefs) => void,
    hold: (on: boolean) => void,
  ) {
    this.expr.placeholder = "12 × (3 + 4,5)";
    this.expr.spellcheck = false;
    this.expr.addEventListener("input", () => this.paintResult());
    this.expr.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const v = calculate(this.expr.value);
      if (v == null) return;
      this.history = [{ expr: this.expr.value, result: showNumber(v, language()) }, ...this.history].slice(0, 6);
      this.expr.value = String(v).replace(".", ",");
      this.paint();
      this.expr.focus();
    });
    this.amount.value = "1";
    this.amount.inputMode = "decimal";
    this.amount.addEventListener("input", () => this.paintQuotes());
    this.newFeed.placeholder = t("Add a news feed (RSS link)");
    this.newPin.placeholder = t("Pinterest: user/board or a board's link");
    for (const f of [this.expr, this.amount, this.newFeed, this.newPin]) typing(f, hold);
  }

  open() {
    this.paint();
    void this.load();
  }

  private async get(url: string): Promise<string | null> {
    if (!IN_APP) return null;
    const r = await Bridge.fetchText(url);
    if ("error" in r) {
      this.error = r.error;
      return null;
    }
    return r.ok;
  }

  /** Fetches what the tab shows (quotes every minute at most). */
  private async load(force = false) {
    this.error = "";
    if (this.tab === "quotes" && (force || Date.now() - this.quotesAt > 60_000)) {
      this.loading = "quotes";
      this.paint();
      const text = await this.get(QUOTES_URL);
      this.quotes = text ? parseQuotes(text) : IN_APP ? this.quotes : SAMPLE_QUOTES;
      this.quotesAt = Date.now();
    } else if (this.tab === "news" && (force || !this.news.length)) {
      this.loading = "news";
      this.paint();
      const lists = await Promise.all(this.prefs().feeds.map(async (u) => parseFeed((await this.get(u)) ?? "")));
      this.news = lists.flat().sort((a, b) => b.date - a.date).slice(0, 60);
    } else if (this.tab === "pins" && (force || !this.pins.length)) {
      this.loading = "pins";
      this.paint();
      const urls = this.prefs().pins.map(pinterestFeed).filter((u): u is string => !!u);
      const lists = await Promise.all(urls.map(async (u) => parseFeed((await this.get(u)) ?? "")));
      this.pins = lists.flat().filter((p) => p.image).slice(0, 80);
    }
    this.loading = "";
    if (this.el.isConnected) this.paint();
  }

  private result = el("div", "calc-result");
  private paintResult() {
    const v = calculate(this.expr.value);
    this.result.textContent = v == null ? "" : `= ${showNumber(v, language())}`;
  }

  private quoteBox = el("div", "quotes");
  private paintQuotes() {
    this.quoteBox.replaceChildren();
    const n = Number(this.amount.value.replace(",", ".")) || 0;
    for (const q of this.quotes) {
      const row = el("div", "quote");
      const ch = el("span", `q-change${q.change >= 0 ? " up" : " down"}`, `${q.change >= 0 ? "▲" : "▼"} ${Math.abs(q.change).toLocaleString(language(), { maximumFractionDigits: 2 })}%`);
      const brl = (n * q.value).toLocaleString(language(), { style: "currency", currency: "BRL", maximumFractionDigits: q.value > 1000 ? 0 : 2 });
      row.append(el("b", "q-code", q.code), el("span", "q-name", q.name), el("span", "q-value", brl), ch);
      this.quoteBox.append(row);
    }
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

  private link(item: FeedItem, cls: string) {
    const a = el("button", cls);
    a.title = item.title;
    a.addEventListener("click", (e) => {
      e.stopPropagation();
      if (item.link) void Bridge.openUrl(item.link);
    });
    return a;
  }

  paint() {
    this.el.replaceChildren();
    const tabs = el("div", "f-tabs");
    for (const [id, label] of [
      ["calc", "Calculator"],
      ["quotes", "Quotes"],
      ["news", "News"],
      ["pins", "Pinterest"],
    ] as [Tab, string][]) {
      const b = el("button", `f-tab${this.tab === id ? " on" : ""}`, t(label));
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.tab = id;
        this.editing = false;
        this.paint();
        void this.load();
      });
      tabs.append(b);
    }
    if (this.tab !== "calc") tabs.append(el("span", "m-gap"), this.btn(REFRESH, t("Refresh"), () => void this.load(true)));
    if (this.tab === "news" || this.tab === "pins") {
      const e = el("button", "set-btn quiet", this.editing ? t("Done") : t("Edit"));
      e.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.editing = !this.editing;
        if (!this.editing) void this.load(true);
        this.paint();
      });
      tabs.append(e);
    }
    const body = el("div", "tools-body");
    if (this.loading) body.append(el("p", "set-note", t("Loading…")));
    if (this.error) body.append(el("p", "set-note error", this.error));
    if (this.tab === "calc") this.calc(body);
    else if (this.tab === "quotes") this.quotesTab(body);
    else if (this.editing) this.edit(body, this.tab);
    else if (this.tab === "news") this.newsTab(body);
    else this.pinsTab(body);
    this.el.append(tabs, body);
  }

  private calc(body: HTMLElement) {
    const pad = el("div", "calc-pad");
    for (const k of ["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "−", "0", ",", "%", "+", "(", ")", "√", "^"]) {
      const b = el("button", "calc-key", k);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.expr.value += k;
        this.paintResult();
      });
      pad.append(b);
    }
    const clear = el("button", "calc-key wide", "C");
    clear.addEventListener("click", (e) => {
      e.stopPropagation();
      this.expr.value = "";
      this.paintResult();
    });
    const eq = el("button", "calc-key eq", "=");
    eq.addEventListener("click", (e) => {
      e.stopPropagation();
      this.expr.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    pad.append(clear, eq);
    const left = el("div", "calc-left");
    this.paintResult();
    left.append(this.expr, this.result);
    const hist = el("div", "calc-history");
    for (const h of this.history) hist.append(el("div", "", `${h.expr} = ${h.result}`));
    left.append(hist);
    body.append(left, pad);
  }

  private quotesTab(body: HTMLElement) {
    const row = el("div", "q-amount");
    row.append(el("span", "set-label", t("Amount")), this.amount);
    if (this.quotesAt) row.append(el("span", "set-note", t("updated {when}", { when: ago(this.quotesAt, Date.now(), language()) })));
    this.paintQuotes();
    body.append(row, this.quoteBox);
    body.classList.add("col");
  }

  private newsTab(body: HTMLElement) {
    const list = el("div", "news");
    if (!this.news.length && !this.loading) list.append(el("p", "set-note", IN_APP ? t("No news. Check the feeds in Edit.") : t("The news loads in the app.")));
    const now = Date.now();
    for (const n of this.news) {
      const a = this.link(n, "news-item");
      const thumb = el("span", "news-thumb");
      if (n.image) thumb.style.backgroundImage = `url("${n.image}")`;
      const text = el("span", "news-text");
      text.append(el("b", "", n.title), el("span", "", [n.source, n.date ? ago(n.date, now, language()) : ""].filter(Boolean).join(" · ")));
      a.append(thumb, text);
      list.append(a);
    }
    body.append(list);
  }

  private pinsTab(body: HTMLElement) {
    const grid = el("div", "pins");
    if (!this.prefs().pins.length) grid.append(el("p", "set-note", t("Add your Pinterest boards in Edit.")));
    else if (!this.pins.length && !this.loading) grid.append(el("p", "set-note", IN_APP ? t("Nothing from these boards (are they public?).") : t("The boards load in the app.")));
    for (const p of this.pins) {
      const a = this.link(p, "pin");
      a.style.backgroundImage = `url("${p.image}")`;
      grid.append(a);
    }
    body.append(grid);
  }

  private edit(body: HTMLElement, tab: "news" | "pins") {
    const prefs = this.prefs();
    const list = tab === "news" ? prefs.feeds : prefs.pins;
    const input = tab === "news" ? this.newFeed : this.newPin;
    const save = (l: string[]) => this.setPrefs(tab === "news" ? { ...prefs, feeds: l } : { ...prefs, pins: l });
    const box = el("div", "edit-list");
    for (const u of list) {
      const row = el("div", "f-link");
      row.append(el("span", "f-link-name", u), this.btn(TRASH, t("Remove"), () => {
        save(list.filter((x) => x !== u));
        if (tab === "news") this.news = [];
        else this.pins = [];
        this.paint();
      }));
      box.append(row);
    }
    const add = el("div", "f-link-add");
    const go = el("button", "set-btn", t("Add"));
    go.addEventListener("click", (e) => {
      e.stopPropagation();
      const v = input.value.trim();
      const ok = tab === "news" ? v.startsWith("https://") : !!pinterestFeed(v);
      input.classList.toggle("bad", !ok);
      if (!ok) return;
      save([...list, v]);
      input.value = "";
      this.paint();
    });
    add.append(input, go);
    box.append(add);
    body.append(box);
  }
}
