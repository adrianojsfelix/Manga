// Manga's words. The interface is written in English keys and shown in the
// user's language: Portuguese (Brazil) first, English as the fallback. More
// languages are a table each.

type Table = Record<string, string>;

const PT: Table = {
  "Assistant": "Assistente",
  "Home": "Início",
  "Hi!": "Oi!",
  "Ask me anything": "Me pergunte algo",
  "NOW PLAYING": "TOCANDO",
  "Nothing playing": "Nada tocando",
  "Phase {n}": "Fase {n}",
  "FOCUS": "FOCO",
  "Ready": "Pronto",
  "Today": "Hoje",
  "Media": "Mídia",
  "Focus": "Foco",
  "Controls": "Controles",
  "Notes": "Notas",
  "Settings": "Configurações",
  "Clock": "Relógio",
  "Date": "Data",
  "Weather": "Clima",
  "Battery": "Bateria",
  "Sound waves": "Ondas sonoras",
  "Countdown": "Contagem",
  "Water": "Água",
  "Recycle Bin": "Lixeira",
  "Keyboard language": "Idioma do teclado",
  "Taskbar apps": "Apps da barra de tarefas",
  "Next event": "Próximo evento",
  "Notifications": "Notificações",
  "Coming in a next step": "Chega numa próxima etapa",
  "Hi! I'm {name}.": "Oi! Eu sou o {name}.",
  "Ask me anything, or click a page above.": "Me pergunte qualquer coisa, ou escolha uma página acima.",
  "This page arrives in phase {n}.": "Esta página chega na fase {n}.",
  "Pin the island open": "Manter a ilha aberta",
  "Close": "Fechar",
};

let lang: "pt" | "en" = (globalThis.navigator?.language ?? "pt").toLowerCase().startsWith("en") ? "en" : "pt";

export function setLanguage(l: "pt" | "en") {
  lang = l;
}

export function language(): string {
  return lang === "pt" ? "pt-BR" : "en";
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let s = lang === "pt" ? (PT[key] ?? key) : key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}
