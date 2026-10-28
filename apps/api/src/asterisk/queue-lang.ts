/** Queue announcement language: the queue's own choice, else the system default. */
export function queueLanguage(queueLang: string | null | undefined, systemLang: "tr" | "en"): "tr" | "en" {
  return queueLang === "tr" || queueLang === "en" ? queueLang : systemLang;
}

/**
 * Voices (TTS models) a queue can announce with. `female` is the voice the base
 * sounds/<lang> pack is made with; the others get their own pack.
 */
const VOICE_SUFFIX: Record<string, { suffix: string; langs: ReadonlyArray<"tr" | "en"> }> = {
  male: { suffix: "male", langs: ["tr", "en"] },
  "ema-lightning": { suffix: "ema", langs: ["tr"] },
};

/**
 * Asterisk channel language for a queue: `tr`, or a variant such as `tr_ema`
 * whose sounds/<variant> folder holds that voice's clips. Asterisk looks a file
 * up in `tr_ema/` first and falls back to `tr/`, so an unbuilt pack still speaks.
 */
export function queueSoundLanguage(lang: "tr" | "en", voice: string | null | undefined): string {
  const v = voice ? VOICE_SUFFIX[voice] : undefined;
  return v && v.langs.includes(lang) ? `${lang}_${v.suffix}` : lang;
}

/**
 * English say_number (Turkish falls back to it) speaks 1–20 as one `digits/N`
 * file. 21 is `digits/20` plus `digits/1`, which would play two sentences.
 */
export const QUEUE_POSITION_SAY_LIMIT = 20;

/**
 * Channel language while a queue says the caller's place. `digits/1`–`digits/20`
 * in this language are the full TTS sentence (`qpos/N`), not the bare number.
 * Other clips (`qpos/`, `qhold/`) still resolve in the parent voice pack.
 */
export function queueAnnounceLanguage(lang: "tr" | "en", voice: string | null | undefined): string {
  return `${queueSoundLanguage(lang, voice)}_ann`;
}

/** Languages a queue's voice pack is needed for (both when the queue follows the system). */
export function queueVoiceLanguages(
  queueLang: string | null | undefined,
  voice: string | null | undefined,
): Array<"tr" | "en"> {
  const v = voice ? VOICE_SUFFIX[voice] : undefined;
  if (!v) return [];
  const langs: Array<"tr" | "en"> = queueLang === "tr" || queueLang === "en" ? [queueLang] : ["tr", "en"];
  return langs.filter((l) => v.langs.includes(l));
}
