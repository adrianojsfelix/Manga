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
  "Ask Kumo…": "Pergunte ao Kumo…",
  "New conversation": "Nova conversa",
  "Stop": "Parar",
  "Send": "Enviar",
  "Ask me anything. I answer with {ai}.": "Me pergunte qualquer coisa. Eu respondo com o {ai}.",
  "In the browser preview I can't reach the AIs. In the Manga app, I answer with Claude or Gemini.": "Na prévia do navegador eu não alcanço as IAs. No app Manga, eu respondo com o Claude ou o Gemini.",
  "Island": "Ilha",
  "Connect with": "Conectar com",
  "API key": "Chave de API",
  "Subscription": "Assinatura",
  "Saved in Windows ••••": "Guardada no Windows ••••",
  "Save": "Salvar",
  "Remove": "Remover",
  "Key": "Chave",
  "Model": "Modelo",
  "The key is kept in Windows' Credential Manager, never in a file.": "A chave fica no Gerenciador de Credenciais do Windows, nunca em arquivo.",
  "Keys are saved only in the app.": "As chaves só são salvas no app.",
  "Uses {cli} installed and signed in on this PC: your plan, no key.": "Usa o {cli} instalado e logado neste PC: o seu plano, sem chave.",
  "Show Windows notifications": "Mostrar notificações do Windows",
  "On": "Ligado",
  "Off": "Desligado",
  "On screen for": "Na tela por",
  "Show again": "Mostrar de novo",
  "Hidden apps": "Apps ocultos",
  "Recent": "Recentes",
  "No notifications yet.": "Nenhuma notificação ainda.",
  "Hide app": "Ocultar app",
  "Shape": "Formato",
  "Notch": "Notch",
  "Floating": "Destacada",
  "At rest": "Em repouso",
  "Small": "Pequena",
  "Medium": "Média",
  "Size": "Tamanho",
  "NOTIFICATIONS": "NOTIFICAÇÕES",
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
