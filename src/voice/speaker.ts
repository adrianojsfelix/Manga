// Manga's voice: Windows' own voices (speechSynthesis, nothing to install) or
// a speech server on this PC (VoiceStudio). One sentence at a time: a new
// one cuts the last. While he speaks, his mouth moves.

import { Bridge, IN_APP } from "../core/bridge.ts";
import { language } from "../core/i18n.ts";
import type { VoicePrefs } from "../core/settings.ts";
import type { Kumo } from "../mascot/kumo.ts";
import { pickVoice, speakable } from "./speech.ts";

export class Speaker {
  private audio: HTMLAudioElement | null = null;
  private token = 0;

  constructor(
    private prefs: () => VoicePrefs,
    private kumo: Kumo,
  ) {
    // The list of voices arrives late in some browsers.
    globalThis.speechSynthesis?.getVoices();
  }

  /** Windows' voices, the user's language first. */
  static voices(): SpeechSynthesisVoice[] {
    const all = globalThis.speechSynthesis?.getVoices() ?? [];
    const base = language().split("-")[0];
    return [...all].sort((a, b) => Number(b.lang.startsWith(base)) - Number(a.lang.startsWith(base)));
  }

  stop() {
    this.token++;
    globalThis.speechSynthesis?.cancel();
    this.audio?.pause();
    this.audio = null;
    this.kumo.talking = false;
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
      if (token !== this.token) return null;
      if ("error" in r) return r.error;
      const a = new Audio(r.ok);
      a.playbackRate = p.rate;
      this.audio = a;
      a.onplay = () => (this.kumo.talking = true);
      a.onended = a.onpause = () => (this.kumo.talking = false);
      try {
        await a.play();
      } catch {
        return "Não consegui tocar a voz.";
      }
      return null;
    }
    const synth = globalThis.speechSynthesis;
    if (!synth) return "Este computador não tem vozes do Windows disponíveis.";
    const u = new SpeechSynthesisUtterance(words);
    const voices = Speaker.voices();
    const chosen = voices.find((v) => v.name === p.windowsVoice) ?? pickVoice(voices, p.gender, language());
    if (chosen) {
      u.voice = chosen;
      u.lang = chosen.lang;
    } else u.lang = language();
    u.rate = p.rate;
    u.onstart = () => (this.kumo.talking = true);
    u.onend = u.onerror = () => (this.kumo.talking = false);
    synth.speak(u);
    return null;
  }
}
