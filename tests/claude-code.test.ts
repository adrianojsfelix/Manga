import { test } from "node:test";
import assert from "node:assert/strict";
import { setLanguage } from "../src/core/i18n.ts";
import { answers, apply, describe, permissionDetail, project, questions, type CcEvent } from "../src/claude-code/sessions.ts";

setLanguage("pt");
const ev = (p: Partial<CcEvent>): CcEvent => ({ event: "", session: "s1", cwd: "C:\\code\\manga", tool: "", input: null, message: "", title: "", ...p });

test("the project is the folder's name, on Windows or not", () => {
  assert.equal(project("C:\\code\\manga\\"), "manga");
  assert.equal(project("/home/a/site"), "site");
  assert.equal(project(""), "Claude Code");
});

test("tool calls read in a few words", () => {
  assert.equal(describe("Edit", { file_path: "C:\\code\\src\\island.ts" }), "Editando island.ts");
  assert.equal(describe("Bash", { command: "npm test", description: "Roda os testes" }), "Roda os testes");
  assert.equal(describe("Bash", { command: "npm   test" }), "npm test");
  assert.equal(describe("mcp__github__create_issue", {}), "github · create_issue");
  assert.equal(describe("AskUserQuestion", {}), "Perguntando a você");
  assert.equal(permissionDetail("Bash", { command: "rm -rf dist" }), "rm -rf dist");
});

test("a session works, waits, finishes and ends", () => {
  let l = apply([], ev({ event: "SessionStart" }), 1);
  assert.equal(l[0].project, "manga");
  l = apply(l, ev({ event: "UserPromptSubmit", message: "conserte o teste" }), 2);
  assert.equal(l[0].state, "working");
  l = apply(l, ev({ event: "PreToolUse", tool: "Read", input: { file_path: "/a/b.ts" } }), 3);
  assert.equal(l[0].doing, "Lendo b.ts");
  l = apply(l, ev({ event: "Notification", message: "Claude is waiting for your input" }), 4);
  assert.equal(l[0].state, "waiting");
  l = apply(l, ev({ event: "Stop" }), 5);
  assert.equal(l[0].state, "done");
  l = apply(l, ev({ session: "s2", event: "UserPromptSubmit", cwd: "/x/site" }), 6);
  assert.deepEqual(l.map((s) => s.project), ["site", "manga"]);
  l = apply(l, ev({ event: "SessionEnd" }), 7);
  assert.deepEqual(l.map((s) => s.id), ["s2"]);
  assert.deepEqual(apply(l, ev({ event: "Unknown" }), 8), l);
});

test("questions are read safely and answered as Claude Code expects", () => {
  const qs = questions({
    questions: [
      { question: "Qual banco?", header: "Banco", multiSelect: false, options: [{ label: "SQLite", description: "local" }, { label: "Postgres" }] },
      { question: "Quais testes?", header: "Testes", multiSelect: true, options: [{ label: "Unidade" }, { label: "E2E" }] },
      { header: "sem pergunta" },
    ],
  });
  assert.equal(qs.length, 2);
  assert.equal(qs[0].options[1].description, "");
  assert.equal(answers(qs, [["SQLite"]]), null, "every question needs an answer");
  assert.deepEqual(answers(qs, [["SQLite"], ["Unidade", "E2E"]]), { "Qual banco?": "SQLite", "Quais testes?": "Unidade, E2E" });
  assert.deepEqual(questions(null), []);
});
