// News and Pinterest boards (their RSS), and currency quotes. Pure readers of
// what the sites send: tested on their own.

export interface FeedItem {
  title: string;
  link: string;
  /** Ms, or 0. */
  date: number;
  image: string;
  source: string;
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? decode(m[1]) : "";
}

function attr(block: string, name: string, at: string): string {
  const m = new RegExp(`<${name}\\b[^>]*\\b${at}=["']([^"']+)["']`, "i").exec(block);
  return m ? decode(m[1]) : "";
}

const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** An RSS or Atom feed's items. */
export function parseFeed(xml: string, source = ""): FeedItem[] {
  const channel = tag(xml.split(/<item[\s>]|<entry[\s>]/i)[0], "title");
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) ?? [];
  return blocks.map((b) => {
    const desc = tag(b, "description") || tag(b, "content:encoded") || tag(b, "summary") || tag(b, "content");
    const image = attr(b, "media:content", "url") || attr(b, "media:thumbnail", "url") || attr(b, "enclosure", "url") || attr(desc, "img", "src");
    const link = tag(b, "link") || attr(b, "link", "href");
    const when = Date.parse(tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || tag(b, "dc:date"));
    return { title: strip(tag(b, "title")) || strip(desc).slice(0, 90), link, date: Number.isFinite(when) ? when : 0, image, source: source || strip(channel) };
  });
}

/** A Pinterest board's (or profile's) RSS address from a link or "user/board". */
export function pinterestFeed(input: string): string | null {
  const s = input.trim().replace(/\/+$/, "");
  const m = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.|www\.)?pinterest\.[a-z.]+\/([^/?#]+)(?:\/([^/?#]+))?/i.exec(s) ?? /^([A-Za-z0-9_.-]+)(?:\/([A-Za-z0-9_.-]+))?$/.exec(s);
  if (!m) return null;
  const [, user, board] = m;
  if (["pin", "search", "ideas", "today"].includes(user.toLowerCase())) return null;
  return board ? `https://www.pinterest.com/${user}/${board}.rss` : `https://www.pinterest.com/${user}/feed.rss`;
}

export interface Quote {
  code: string;
  name: string;
  /** In reais. */
  value: number;
  /** % today. */
  change: number;
}

/** AwesomeAPI's answer (economia.awesomeapi.com.br/json/last/…). */
export function parseQuotes(json: string): Quote[] {
  let data: Record<string, Record<string, string>>;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  return Object.values(data ?? {})
    .filter((q) => q && typeof q === "object" && q.code && q.bid)
    .map((q) => ({ code: q.code, name: (q.name ?? q.code).split("/")[0], value: Number(q.bid), change: Number(q.pctChange) || 0 }))
    .filter((q) => Number.isFinite(q.value));
}

export const QUOTES_URL = "https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL,ETH-BRL,GBP-BRL";

export const DEFAULT_FEEDS = ["https://g1.globo.com/rss/g1/", "https://feeds.bbci.co.uk/portuguese/rss.xml", "https://tecnoblog.net/feed/"];
