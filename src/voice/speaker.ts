// Manga's voice: Windows' own speech engine (its installed voices, female or
// male — spoken by Rust, so it works whatever the page's browser offers), or
// a speech server on this PC (VoiceStudio). One sentence at a time: a new
// one cuts the last. While he speaks, his mouth moves.

import { Bridge, IN_APP } from "../core/bridge.ts";
import { language } from "../core/i18n.ts";
import type { VoicePrefs } from "../core/settings.ts";
import type { Kumo } from "../mascot/kumo.ts";
import { chooseVoice, genderOf, speakable, type Voice } from "./speech.ts";

let cached: Voice[] | null = null;

export class Speaker {
  private audio: HTMLAudioElement | null = null;
  private token = 0;

  constructor(
    private prefs: () => VoicePrefs,
    private kumo: Kumo,
  ) {
    void Speaker.voices();
  }

  /** The voices to choose from: Windows' in the app, the browser's in the preview. */
  static async voices(refresh = false): Promise<Voice[]> {
    if (cached && !refresh) return cached;
    if (IN_APP) {
      cached = (await Bridge.windowsVoices()) ?? [];
    } else {
      const synth = globalThis.speechSynthesis;
      let list = synth?.getVoices() ?? [];
      if (synth && !list.length) {
        await new Promise((r) => setTimeout(r, 400));
        list = synth.getVoices();
      }
      cached = list.map((v) => ({ id: v.name, name: v.name, lang: v.lang, gender: genderOf(v.name) }));
    }
    const base = language().split("-")[0];
    cached.sort((a, b) => Number(b.lang.startsWith(base)) - Number(a.lang.startsWith(base)));
    return cached;
  }

  stop() {
    this.token++;
    globalThis.speechSynthesis?.cancel();
    this.audio?.pause();
    this.audio = null;
    this.kumo.talking = false;
  }

  private async play(url: string, rate: number, token: number): Promise<string | null> {
    if (token !== this.token) return null;
    const a = new Audio(url);
    a.playbackRate = rate;
    this.audio = a;
    a.onplay = () => (this.kumo.talking = true);
    a.onended = a.onpause = () => (this.kumo.talking = false);
    try {
      await a.play();
      return null;
    } catch {
      return "Não consegui tocar a voz.";
    }
  }

  /** Says `text` (when the voice is on, or `force` for a test). Answers an error, if any. */
  async say(text: string, force = false): Promise<string | null> {
    const p = this.prefs();
    if (!p.on && !force) return null;
    const words = speakable(text);
    if (!words) return null;
    this.stop();
    const token = this.token;

    if (p.engine === "studio") {
      if (!IN_APP) return "O Voice Studio fala só no app.";
      const r = await Bridge.voiceSpeak(p.studioUrl, p.studioVoice, p.studioModel, words);
      if ("error" in r) return r.error;
      return this.play(r.ok, p.rate, token);
    }

    const voices = await Speaker.voices();
    const chosen = voices.find((v) => v.id === p.windowsVoice) ?? chooseVoice(voices, p.gender, language());
    if (IN_APP) {
      if (!voices.length) return "O Windows não tem nenhuma voz instalada. Adicione em Configurações → Hora e idioma → Fala.";
      // Windows speaks it (the rate goes there; the page plays it as is).
      const r = await Bridge.windowsSpeak(words, chosen?.id ?? "", p.rate);
      if ("error" in r) return r.error;
      return this.play(r.ok, 1, token);
    }
    const synth = globalThis.speechSynthesis;
    if (!synth) return "Este navegador não tem vozes.";
    const u = new SpeechSynthesisUtterance(words);
    const v = synth.getVoices().find((x) => x.name === chosen?.id);
    if (v) u.voice = v;
    u.lang = v?.lang ?? language();
    u.rate = p.rate;
    u.onstart = () => (this.kumo.talking = true);
    u.onend = u.onerror = () => (this.kumo.talking = false);
    synth.speak(u);
    return null;
  }
}
