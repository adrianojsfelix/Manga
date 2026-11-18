// What Manga says out loud: the answer made speakable, and his voice chosen
// among Windows' (female or male, Portuguese first). Pure: tested on its own.

/** Text for a voice: no Markdown, no action lines, no addresses read letter by letter. */
export function speakable(text: string, max = 600): string {
  const s = text
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/^\s{0,3}(#{1,6}|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > max * 0.5 ? cut.slice(0, end + 1) : `${cut}…`;
}

export interface VoiceInfo {
  name: string;
  lang: string;
}

// Windows' (and Edge's) voices by their names.
const FEMALE = /maria|francisca|thalita|leila|helo|yara|giovanna|brenda|elza|manuela|fernanda|zira|aria|jenny|hazel|susan|libby|sonia|female|feminin/i;
const MALE = /daniel|antonio|donato|fabio|humberto|julio|nicolau|valerio|david|mark|guy|ryan|george|male|masculin/i;

export function genderOf(name: string): "female" | "male" | null {
  if (FEMALE.test(name)) return "female";
  if (MALE.test(name)) return "male";
  return null;
}

/** The voice for a gender: the user's language first, natural (online) voices first. */
export function pickVoice<T extends VoiceInfo>(voices: readonly T[], gender: "female" | "male", lang = "pt-BR"): T | null {
  const base = lang.split("-")[0].toLowerCase();
  const score = (v: T) => {
    let s = 0;
    const l = v.lang.toLowerCase();
    if (l === lang.toLowerCase()) s += 4;
    else if (l.startsWith(base)) s += 2;
    if (genderOf(v.name) === gender) s += 3;
    if (/natural|online/i.test(v.name)) s += 1;
    return s;
  };
  const best = [...voices].sort((a, b) => score(b) - score(a))[0];
  return best && score(best) >= 3 ? best : null;
}

export interface Voice {
  id: string;
  name: string;
  lang: string;
  gender: "female" | "male" | null;
}

/** Among voices that know their gender: the user's language, the gender asked, natural ones first. */
export function chooseVoice(voices: readonly Voice[], gender: "female" | "male", lang = "pt-BR"): Voice | null {
  const base = lang.split("-")[0].toLowerCase();
  const score = (v: Voice) => {
    let s = 0;
    const l = v.lang.toLowerCase();
    if (l === lang.toLowerCase()) s += 4;
    else if (l.startsWith(base)) s += 2;
    if ((v.gender ?? genderOf(v.name)) === gender) s += 3;
    if (/natural|online/i.test(v.name)) s += 1;
    return s;
  };
  const best = [...voices].sort((a, b) => score(b) - score(a))[0];
  return best ?? null;
}
