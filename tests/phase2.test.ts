import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, sanitizeSettings } from "../src/core/settings.ts";
import { EMPTY, ask, delta, done, moodOf, toSend, SENT_TURNS } from "../src/assistant/conversation.ts";
import { ago, remember, shows, KEEP } from "../src/notify/notices.ts";

test("saved settings keep what is valid and fall back on the rest", () => {
  assert.deepEqual(sanitizeSettings(null), DEFAULT_SETTINGS);
  const s = sanitizeSettings({
    provider: "gemini",
    ai: { claude: { mode: "subscription", model: "  claude-x " }, gemini: { mode: "nope" } },
    notifications: { on: false, ignored: ["Teams", "Teams", 3, " "], seconds: 99 },
    island: { shape: "floating", rest: "huge", scale: 3 },
    claudeCode: { ask: false },
  });
  assert.equal(s.claudeCode.ask, false);
  assert.deepEqual(s.island, { shape: "floating", rest: "small", scale: 1.4 });
  assert.equal(s.provider, "gemini");
  assert.deepEqual(s.ai.claude, { mode: "subscription", model: "claude-x" });
  assert.deepEqual(s.ai.gemini, { mode: "key", model: "" });
  assert.deepEqual(s.notifications, { on: false, ignored: ["Teams"], seconds: 30 });
});

test("a conversation streams an answer and Kumo's face follows", () => {
  let c = ask(EMPTY, "  oi  ", "a", "claude");
  assert.equal(c.phase, "waiting");
  assert.equal(moodOf(c.phase), "thinking");
  assert.equal(ask(c, "outra", "b", "claude"), c, "one question at a time");
  c = delta(c, "zzz", "ignored");
  c = delta(c, "a", "Olá");
  c = delta(c, "a", "!");
  assert.equal(c.phase, "writing");
  assert.deepEqual(toSend(c), [{ role: "user", text: "oi" }, { role: "assistant", text: "Olá!" }]);
  c = done(c, "a", null, false);
  assert.equal(c.pending, null);
  assert.equal(moodOf(c.phase), "happy");
  assert.deepEqual(c.turns.map((t) => t.text), ["oi", "Olá!"]);
});

test("what goes to the AI skips the empty answer and failed exchanges", () => {
  let c = ask(EMPTY, "primeira", "a", "gemini");
  c = done(c, "a", "Sem conexão.", false);
  assert.equal(c.phase, "error");
  assert.equal(c.turns[1].text, "Sem conexão.");
  c = ask(c, "segunda", "b", "gemini");
  assert.deepEqual(toSend(c), [{ role: "user", text: "segunda" }]);
});

test("only the newest turns are sent, starting with a question", () => {
  let c = EMPTY;
  for (let i = 0; i < 30; i++) {
    c = ask(c, `q${i}`, `${i}`, "claude");
    c = delta(c, `${i}`, `a${i}`);
    c = done(c, `${i}`, null, false);
  }
  const sent = toSend(c);
  assert.ok(sent.length <= SENT_TURNS);
  assert.equal(sent[0].role, "user");
  assert.equal(sent.at(-1)!.text, "a29");
});

test("notifications: ignored apps and empty ones are not shown; the list keeps the newest", () => {
  const n = { id: 1, app: "Microsoft Teams", title: "Ana", body: "Oi", at: 0 };
  assert.ok(shows(n, []));
  assert.ok(!shows(n, ["microsoft teams"]));
  assert.ok(!shows({ ...n, title: "", body: "" }, []));
  let list: typeof n[] = [];
  for (let i = 0; i < KEEP + 5; i++) list = remember(list, { ...n, id: i });
  list = remember(list, { ...n, id: KEEP + 4 });
  assert.equal(list.length, KEEP);
  assert.equal(list[0].id, KEEP + 4);
  assert.equal(new Set(list.map((x) => x.id)).size, KEEP);
});

test("how long ago reads short", () => {
  const now = Date.UTC(2026, 10, 17, 12);
  assert.equal(ago(now - 5_000, now, "pt-BR"), "agora");
  assert.equal(ago(now - 5 * 60_000, now, "pt-BR"), "5 min");
  assert.equal(ago(now - 3 * 3600_000, now, "en"), "3 h");
});
