import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, showNumber } from "../src/tools/calc.ts";
import { parseFeed, parseQuotes, pinterestFeed } from "../src/tools/feeds.ts";
import { pct, push, sparkline, uptime } from "../src/sysinfo/stats.ts";

test("the calculator follows the usual order and reads commas", () => {
  assert.equal(calculate("2+3×4"), 14);
  assert.equal(calculate("(2+3)*4"), 20);
  assert.equal(calculate("1,5 + 2,25"), 3.75);
  assert.equal(calculate("2^3^2"), 512);
  assert.equal(calculate("-3^2"), -9);
  assert.equal(calculate("200 * 15%"), 30);
  assert.equal(calculate("√16 + 2(3)"), 10);
  assert.equal(calculate("0.1+0.2"), 0.3);
  assert.equal(calculate("10 ÷ 4"), 2.5);
  assert.equal(calculate("2+"), null);
  assert.equal(calculate("(1"), null);
  assert.equal(calculate("1/0"), null);
  assert.equal(calculate("alert(1)"), null);
  assert.equal(showNumber(1234.5), "1.234,5");
});

test("an RSS feed's items, with their pictures", () => {
  const xml = `<rss><channel><title>G1</title>
    <item><title><![CDATA[Chuva em SP]]></title><link>https://g1.com/a</link><pubDate>Tue, 17 Nov 2026 10:00:00 GMT</pubDate>
      <media:content url="https://img/a.jpg" /></item>
    <item><title>Pin &amp; cia</title><link>https://pinterest.com/pin/1</link>
      <description>&lt;a href="x"&gt;&lt;img src="https://i.pinimg.com/236x/a.jpg"&gt;&lt;/a&gt;Nice</description></item>
  </channel></rss>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 2);
  assert.deepEqual([items[0].title, items[0].link, items[0].image, items[0].source], ["Chuva em SP", "https://g1.com/a", "https://img/a.jpg", "G1"]);
  assert.equal(items[0].date, Date.UTC(2026, 10, 17, 10));
  assert.equal(items[1].title, "Pin & cia");
  assert.equal(items[1].image, "https://i.pinimg.com/236x/a.jpg");
  const atom = parseFeed(`<feed><title>Blog</title><entry><title>Oi</title><link href="https://b/1"/><updated>2026-11-17T10:00:00Z</updated></entry></feed>`);
  assert.deepEqual([atom[0].title, atom[0].link, atom[0].source], ["Oi", "https://b/1", "Blog"]);
});

test("Pinterest boards from a link or user/board", () => {
  assert.equal(pinterestFeed("https://br.pinterest.com/ana/cozinha/"), "https://www.pinterest.com/ana/cozinha.rss");
  assert.equal(pinterestFeed("ana/cozinha"), "https://www.pinterest.com/ana/cozinha.rss");
  assert.equal(pinterestFeed("ana"), "https://www.pinterest.com/ana/feed.rss");
  assert.equal(pinterestFeed("https://pinterest.com/pin/123"), null);
  assert.equal(pinterestFeed("not a / board"), null);
});

test("currency quotes from AwesomeAPI", () => {
  const q = parseQuotes(JSON.stringify({ USDBRL: { code: "USD", name: "Dólar Americano/Real Brasileiro", bid: "5.31", pctChange: "-0.4" }, X: { code: "Y" } }));
  assert.deepEqual(q, [{ code: "USD", name: "Dólar Americano", value: 5.31, change: -0.4 }]);
  assert.deepEqual(parseQuotes("nope"), []);
});

test("system numbers", () => {
  let h: number[] = [];
  for (let i = 0; i < 70; i++) h = push(h, i);
  assert.equal(h.length, 60);
  assert.equal(h[59], 69);
  assert.equal(pct(3, 4), 75);
  assert.equal(pct(1, 0), 0);
  assert.equal(uptime(3 * 86400 + 4 * 3600), "3 d 4 h");
  assert.equal(uptime(5 * 3600 + 12 * 60), "5 h 12 min");
  assert.equal(sparkline([0, 50, 100], 100, 10, 100), "0.0,10.0 50.0,5.0 100.0,0.0");
});
