import { ari } from "./ari.js";

/**
 * Sentence-by-sentence IVR speech.
 *
 * Neural TTS (EMA/Kokoro on the PBX CPU) takes roughly as long as the audio it
 * produces: a 30-second pharmacy read-out used to leave the caller in ~30 s of
 * silence. Text is split into short chunks; chunk 1 is synthesized and played
 * at once while chunk 2 is synthesized in the background, and so on — the caller
 * only ever waits for the first chunk. Each chunk is cached on its own, so
 * recurring sentences get instant over time.
 */

type Lang = "en" | "tr";

/** First chunk is kept short so speech starts fast. */
const FIRST_MAX = 90;
const CHUNK_MAX = 180;
const CHUNK_MIN = 28;

/**
 * Split speech into chunks at sentence ends (. ! ? …) followed by a space, then
 * break over-long sentences at commas/semicolons. Decimals ("6.568,24") and codes
 * ("NO:34/B") never split — a boundary needs whitespace after the punctuation.
 * Very short pieces ("MAH.") are merged with their neighbour.
 */
export function splitSpeech(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?…])\s+(?=\S)/);

  const pieces: string[] = [];
  for (const s of sentences) {
    const max = pieces.length === 0 ? FIRST_MAX : CHUNK_MAX;
    if (s.length <= max) {
      pieces.push(s);
      continue;
    }
    // Long sentence: greedy split at ", " / "; " boundaries
    let cur = "";
    for (const part of s.split(/(?<=[,;])\s+/)) {
      const limit = pieces.length === 0 ? FIRST_MAX : CHUNK_MAX;
      if (cur && cur.length + 1 + part.length > limit) {
        pieces.push(cur);
        cur = part;
      } else {
        cur = cur ? `${cur} ${part}` : part;
      }
    }
    if (cur) pieces.push(cur);
  }

  // Merge fragments shorter than CHUNK_MIN into the following piece
  const out: string[] = [];
  let carry = "";
  for (const p of pieces) {
    const merged = carry ? `${carry} ${p}` : p;
    if (merged.length < CHUNK_MIN) carry = merged;
    else {
      out.push(merged);
      carry = "";
    }
  }
  if (carry) {
    if (out.length) out[out.length - 1] = `${out[out.length - 1]} ${carry}`;
    else out.push(carry);
  }
  return out;
}

type Synth = { media: string; cached: boolean; ms: number };

/** Start synthesizing chunk i; failures resolve to null so a bad chunk is skipped. */
function synthChunk(text: string, lang: Lang, voice: string): Promise<Synth | null> {
  return import("../lib/tts.js")
    .then(({ ensureSpeechMedia }) => ensureSpeechMedia(text, lang, 1.05, voice))
    .catch((e: unknown) => {
      console.warn(`[speech] chunk synth failed: ${(e as Error).message}`);
      return null;
    });
}

export type SpeakResult = {
  /** At least one chunk was played. */
  played: boolean;
  /** A DTMF digit stopped playback (interruptible mode). */
  interrupted: boolean;
  chunks: number;
};

/**
 * Speak `text` chunk by chunk, synthesizing the next chunk while the current one
 * plays. With `interruptible`, a DTMF digit stops playback and the rest is skipped
 * (the digit stays buffered for the caller's next read).
 */
export async function speakChunked(
  channelId: string,
  text: string,
  lang: Lang,
  voice: string,
  opts: { interruptible?: boolean; tag?: string } = {},
): Promise<SpeakResult> {
  const chunks = splitSpeech(text);
  const tag = opts.tag ?? "tts";
  const result: SpeakResult = { played: false, interrupted: false, chunks: chunks.length };
  if (!chunks.length) return result;

  let pending = synthChunk(chunks[0]!, lang, voice);
  for (let i = 0; i < chunks.length; i++) {
    const s = await pending;
    if (i + 1 < chunks.length) pending = synthChunk(chunks[i + 1]!, lang, voice);
    if (!s) continue;
    console.log(`[flow] ${channelId} ${tag} ${i + 1}/${chunks.length} ${s.cached ? "cache" : "synth"} ${s.ms}ms`);
    if (opts.interruptible && ari.hasBufferedDtmf(channelId)) {
      result.interrupted = true;
      break;
    }
    const ok = await ari.playAndWait(channelId, s.media, 60_000, { interruptible: opts.interruptible });
    if (!ok) break; // channel gone or media path broken — stop, don't spin through chunks
    result.played = true;
    if (opts.interruptible && ari.hasBufferedDtmf(channelId)) {
      result.interrupted = true;
      break;
    }
  }
  if (!result.played && !result.interrupted) {
    await ari.playAndWait(channelId, "sound:beep", 2000).catch(() => undefined);
  }
  return result;
}

/**
 * Menu prompt: speak chunks (a key stops the prompt), then wait for one digit.
 * The last chunk plays through playCollectDtmf so a key pressed during it is
 * picked up exactly as before; earlier chunks are interruptible.
 */
export async function speakThenCollectDigit(
  channelId: string,
  text: string,
  lang: Lang,
  voice: string,
  timeoutMs: number,
  opts: { clear?: boolean } = {},
): Promise<string | null> {
  if (opts.clear) ari.clearDtmfBuffer(channelId);
  const chunks = splitSpeech(text);
  if (!chunks.length) return ari.waitDtmf(channelId, timeoutMs);

  let pending = synthChunk(chunks[0]!, lang, voice);
  for (let i = 0; i < chunks.length; i++) {
    const s = await pending;
    const last = i === chunks.length - 1;
    if (!last) pending = synthChunk(chunks[i + 1]!, lang, voice);
    if (s) console.log(`[flow] ${channelId} menu-tts ${i + 1}/${chunks.length} ${s.cached ? "cache" : "synth"} ${s.ms}ms`);
    if (ari.hasBufferedDtmf(channelId)) return ari.waitDtmf(channelId, timeoutMs);
    if (last) {
      if (s) return ari.playCollectDtmf(channelId, s.media, timeoutMs, { clear: false });
      return ari.waitDtmf(channelId, timeoutMs);
    }
    if (s) {
      const ok = await ari.playAndWait(channelId, s.media, 60_000, { interruptible: true });
      if (!ok) return ari.waitDtmf(channelId, timeoutMs);
    }
  }
  return ari.waitDtmf(channelId, timeoutMs);
}
