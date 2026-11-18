// What is going on in the person's day, as a few lines for the AI (only when
// they let Manga share it). Pure: tested on its own.

export interface DayFacts {
  now: Date;
  lang: string;
  weather?: { temp: number; sky: string; place: string } | null;
  events: { title: string; when: string }[];
  tasks: { text: string; due: string }[];
  focus: { phase: string; running: boolean; left: string; task: string | null };
  water?: { ml: number; goal: number } | null;
  playing?: { title: string; app: string } | null;
  unread: number;
  lastNotices: { app: string; title: string }[];
}

export function dayContext(f: DayFacts): string {
  const lines: string[] = [];
  const date = f.now.toLocaleDateString(f.lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const time = f.now.toLocaleTimeString(f.lang, { hour: "2-digit", minute: "2-digit" });
  lines.push(`Agora: ${date}, ${time}.`);
  if (f.weather) lines.push(`Clima em ${f.weather.place}: ${f.weather.temp}°, ${f.weather.sky}.`);
  lines.push(f.events.length ? `Próximos eventos: ${f.events.slice(0, 6).map((e) => `${e.title} (${e.when})`).join("; ")}.` : "Sem eventos nos próximos dias.");
  lines.push(f.tasks.length ? `Tarefas pendentes: ${f.tasks.slice(0, 12).map((t) => (t.due ? `${t.text} (até ${t.due})` : t.text)).join("; ")}.` : "Nenhuma tarefa pendente.");
  const focus = f.focus.running ? `${f.focus.phase} rodando, faltam ${f.focus.left}` : `${f.focus.phase} parado`;
  lines.push(`Foco: ${focus}${f.focus.task ? `, focando em "${f.focus.task}"` : ""}.`);
  if (f.water) lines.push(`Água hoje: ${f.water.ml} ml de ${f.water.goal} ml.`);
  if (f.playing) lines.push(`Tocando: ${f.playing.title} (${f.playing.app}).`);
  if (f.unread) lines.push(`${f.unread} notificação(ões) não vista(s)${f.lastNotices.length ? `: ${f.lastNotices.slice(0, 3).map((n) => `${n.app} — ${n.title}`).join("; ")}` : ""}.`);
  return lines.join("\n");
}
