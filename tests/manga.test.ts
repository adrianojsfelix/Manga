import { test } from "node:test";
import assert from "node:assert/strict";
import { hidePending, readActions, toAction } from "../src/assistant/actions.ts";
import { dayContext } from "../src/assistant/context.ts";
import { genderOf, pickVoice, speakable } from "../src/voice/speech.ts";
import { remark, restMood } from "../src/mascot/reactions.ts";

test("actions are read from the answer and leave it", () => {
  const r = readActions('Feito!\n[[acao {"tipo":"tarefa","texto":"Ligar pro dentista","data":"2026-11-20"}]]\n[[acao {"tipo":"musica","estilo":"rain"}]]\n[[acao {"tipo":"voar"}]]\n[[acao {quebrado}]]');
  assert.equal(r.clean, "Feito!");
  assert.deepEqual(r.actions, [
    { kind: "task", text: "Ligar pro dentista", date: "2026-11-20" },
    { kind: "music", station: "rain" },
  ]);
  assert.deepEqual(toAction({ tipo: "alarme", hora: "7:05", nome: "Acordar" }), { kind: "alarm", time: "07:05", label: "Acordar" });
  assert.equal(toAction({ tipo: "alarme", hora: "25:00" }), null);
  assert.deepEqual(toAction({ tipo: "pomodoro" }), { kind: "pomodoro", minutes: null });
  assert.equal(toAction({ tipo: "timer", minutos: 0 }), null);
  assert.deepEqual(toAction({ tipo: "abrir", pagina: "Hoje" }), { kind: "open", page: "today" });
  assert.equal(hidePending('Ok, vou criar [[acao {"tipo":"tar'), "Ok, vou criar ");
  assert.equal(hidePending("Pronto [[acao {}]] feito"), "Pronto [[acao {}]] feito");
});

test("the day as lines for the AI", () => {
  const c = dayContext({
    now: new Date(2026, 10, 18, 9, 30),
    lang: "pt-BR",
    weather: { temp: 27, sky: "Parcialmente nublado", place: "Recife" },
    events: [{ title: "Dentista", when: "Amanhã 10:00" }],
    tasks: [{ text: "Relatório", due: "2026-11-19" }, { text: "Café", due: "" }],
    focus: { phase: "Foco", running: true, left: "12:00", task: "Relatório" },
    water: { ml: 750, goal: 2000 },
    playing: null,
    unread: 2,
    lastNotices: [{ app: "WhatsApp", title: "Ana" }],
  });
  assert.match(c, /^Agora: quarta-feira, 18 de novembro de 2026, 09:30\./);
  assert.match(c, /Clima em Recife: 27°/);
  assert.match(c, /Relatório \(até 2026-11-19\); Café/);
  assert.match(c, /Foco rodando, faltam 12:00, focando em "Relatório"/);
  assert.match(c, /2 notificação\(ões\) não vista\(s\): WhatsApp — Ana/);
});

test("speech without Markdown, addresses or actions", () => {
  assert.equal(speakable("## Oi\n- **um** item\n- veja [o site](https://x.com) e https://y.com\n[[acao {}]]"), "Oi um item veja o site e link");
  const long = "Frase um. ".repeat(100);
  assert.ok(speakable(long, 100).endsWith("."));
});

test("a female or male voice, Portuguese first", () => {
  const voices = [
    { name: "Microsoft Zira - English (United States)", lang: "en-US" },
    { name: "Microsoft Daniel - Portuguese (Brazil)", lang: "pt-BR" },
    { name: "Microsoft Francisca Online (Natural) - Portuguese (Brazil)", lang: "pt-BR" },
    { name: "Microsoft Maria - Portuguese (Brazil)", lang: "pt-BR" },
  ];
  assert.equal(pickVoice(voices, "female")?.name, "Microsoft Francisca Online (Natural) - Portuguese (Brazil)");
  assert.equal(pickVoice(voices, "male")?.name, "Microsoft Daniel - Portuguese (Brazil)");
  assert.equal(pickVoice([{ name: "X", lang: "ja-JP" }], "male"), null);
  assert.equal(genderOf("Microsoft Antonio Online"), "male");
});

test("Manga's moods and remarks", () => {
  const base = { hour: 14, battery: 0.8, charging: false, cpu: 20, focusing: false, onBreak: false, goalReached: false };
  assert.equal(restMood(base), "idle");
  assert.equal(restMood({ ...base, battery: 0.1 }), "sad");
  assert.equal(restMood({ ...base, battery: 0.1, charging: true }), "idle");
  assert.equal(restMood({ ...base, cpu: 97 }), "dizzy");
  assert.equal(restMood({ ...base, focusing: true }), "working");
  assert.equal(restMood({ ...base, hour: 1 }), "sleepy");
  assert.equal(remark("idle", "sad"), "Bateria fraca… liga o carregador?");
  assert.equal(remark("working", "sleepy"), null);
  assert.equal(remark("idle", "idle"), null);
});
