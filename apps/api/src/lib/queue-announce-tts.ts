/**
 * Generate Asterisk queue announce sound packs via TTS.
 * Missing files are synthesized; existing files are reused (cache).
 * While announcing, Asterisk pauses MOH, then resumes.
 */
import { existsSync, lstatSync, statSync } from "node:fs";
import { mkdir, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { queues } from "../db/schema.js";
import { queueSoundLanguage, queueVoiceLanguages } from "../asterisk/queue-lang.js";
import { synthesizeSpeech, type TtsLanguage } from "./tts.js";

type Pack = {
  lang: TtsLanguage;
  phrases: Record<string, string>;
  /** Asterisk say_number looks up these under digits/ */
  digits: Record<string, string>;
};

const PACKS: Pack[] = [
  {
    lang: "tr",
    phrases: {
      "queue-youarenext": "Bekleyenler arasında 1. sıradasınız.",
      "queue-thereare": "Önünüzde",
      "queue-callswaiting": "kişi bekliyor.",
      "queue-holdtime": "Tahmini bekleme süreniz yaklaşık",
      "queue-minutes": "dakika.",
      "queue-minute": "dakika.",
      "queue-seconds": "saniye.",
      "queue-thankyou": "Sabrınız için teşekkür ederiz.",
      "queue-reporthold": "Bekleme süreniz",
      "queue-callback-offer":
        "Sıranızı kaybetmeden geri aranmak için 1'e basın. Beklemeye devam etmek için bekleyin.",
      "queue-callback-confirm": "Talebiniz alındı. Sıra size geldiğinde sizi arayacağız. İyi günler.",
    },
    digits: {
      "0": "sıfır",
      "1": "bir",
      "2": "iki",
      "3": "üç",
      "4": "dört",
      "5": "beş",
      "6": "altı",
      "7": "yedi",
      "8": "sekiz",
      "9": "dokuz",
      "10": "on",
      "11": "on bir",
      "12": "on iki",
      "13": "on üç",
      "14": "on dört",
      "15": "on beş",
      "16": "on altı",
      "17": "on yedi",
      "18": "on sekiz",
      "19": "on dokuz",
      "20": "yirmi",
      "30": "otuz",
      "40": "kırk",
      "50": "elli",
      "60": "altmış",
      "70": "yetmiş",
      "80": "seksen",
      "90": "doksan",
      "100": "yüz",
    },
  },
  {
    lang: "en",
    phrases: {
      "queue-youarenext": "You are now first in line.",
      "queue-thereare": "There are",
      "queue-callswaiting": "calls waiting ahead of you.",
      "queue-holdtime": "The estimated hold time is currently",
      "queue-minutes": "minutes.",
      "queue-minute": "minute.",
      "queue-seconds": "seconds.",
      "queue-thankyou": "Thank you for your patience.",
      "queue-reporthold": "Your hold time has been",
      "queue-callback-offer":
        "To keep your place and receive a callback, press 1. Otherwise, please continue to hold.",
      "queue-callback-confirm":
        "Your request was received. We will call you back when it is your turn. Goodbye.",
    },
    digits: {
      "0": "zero",
      "1": "one",
      "2": "two",
      "3": "three",
      "4": "four",
      "5": "five",
      "6": "six",
      "7": "seven",
      "8": "eight",
      "9": "nine",
      "10": "ten",
      "11": "eleven",
      "12": "twelve",
      "13": "thirteen",
      "14": "fourteen",
      "15": "fifteen",
      "16": "sixteen",
      "17": "seventeen",
      "18": "eighteen",
      "19": "nineteen",
      "20": "twenty",
      "30": "thirty",
      "40": "forty",
      "50": "fifty",
      "60": "sixty",
      "70": "seventy",
      "80": "eighty",
      "90": "ninety",
      "100": "one hundred",
    },
  },
];

/** Full-sentence position clips, e.g. Turkish “Bekleyenler arasında 3. sıradasınız.” (“You are 3rd in line.”) */
const POS_MAX = 30;
const HOLD_MAX = 30;
/** Bump when sentence/phrase templates change so WAVs regenerate. */
const PACK_VERSION = "tr-bekleyenler-callback-v4";

function soundsRoot(): string {
  return path.join(config.asterisk.configDir, "sounds");
}

function positionSentence(lang: TtsLanguage, i: number): string {
  if (lang === "tr") {
    return `Bekleyenler arasında ${i}. sıradasınız.`;
  }
  return i === 1
    ? "You are number one in the queue."
    : `You are number ${i} in the queue.`;
}

function holdSentence(lang: TtsLanguage, minutes: number): string {
  if (lang === "tr") {
    return minutes === 1
      ? "Tahmini bekleme süreniz yaklaşık 1 dakika."
      : `Tahmini bekleme süreniz yaklaşık ${minutes} dakika.`;
  }
  return minutes === 1
    ? "The estimated hold time is about 1 minute."
    : `The estimated hold time is about ${minutes} minutes.`;
}

async function writeClip(
  filePath: string,
  text: string,
  lang: TtsLanguage,
  force = false,
  voice?: string,
): Promise<boolean> {
  // Cache: reuse existing WAV if present
  if (!force && existsSync(filePath) && statSync(filePath).size > 200) {
    return false;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  const wav = await synthesizeSpeech(text, lang, lang === "tr" ? 0.98 : 1.0, voice);
  await writeFile(filePath, wav);
  return true;
}

async function readVersion(verPath: string): Promise<string> {
  try {
    return (await readFile(verPath, "utf8")).trim();
  } catch {
    return "";
  }
}

export async function ensureQueueAnnounceSounds(): Promise<{ written: number; skipped: number }> {
  // One build at a time: boot and every queue save both ask for it.
  const run = building.then(buildAllPacks);
  building = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

let building: Promise<unknown> = Promise.resolve();

async function buildAllPacks(): Promise<{ written: number; skipped: number }> {
  if (!config.ttsUrl) {
    console.warn("[queue-tts] TTS_URL unset — skip announce pack");
    return { written: 0, skipped: 0 };
  }
  let written = 0;
  let skipped = 0;
  const root = soundsRoot();
  const add = (r: { written: number; skipped: number }) => {
    written += r.written;
    skipped += r.skipped;
  };

  // Base packs (default voice) → sounds/<lang>
  for (const pack of PACKS) add(await buildPack(root, pack, pack.lang));

  // Voices chosen on queues → sounds/<lang>_<voice> (Asterisk falls back to <lang>)
  const used = await db.select({ language: queues.language, voice: queues.voice }).from(queues).catch(() => []);
  const variants = new Map<string, { pack: Pack; voice: string }>();
  for (const q of used) {
    for (const lang of queueVoiceLanguages(q.language, q.voice)) {
      const dirName = queueSoundLanguage(lang, q.voice);
      const pack = PACKS.find((p) => p.lang === lang);
      if (pack && dirName !== lang) variants.set(dirName, { pack, voice: q.voice! });
    }
  }
  for (const [dirName, { pack, voice }] of variants) {
    try {
      add(await buildPack(root, pack, dirName, voice));
      await linkIntoAsteriskSounds(root, dirName);
    } catch (e) {
      console.warn(`[queue-tts] ${dirName} skipped (falls back to ${pack.lang}):`, (e as Error).message);
    }
  }

  console.log(`[queue-tts] announce pack written=${written} skipped=${skipped}`);
  return { written, skipped };
}

/**
 * Embedded Asterisk reads sounds/<lang> under /var/lib/asterisk/sounds; make the new
 * variant folder visible there (start-asterisk links them too, at boot / reload).
 */
async function linkIntoAsteriskSounds(root: string, dirName: string): Promise<void> {
  const sounds = "/var/lib/asterisk/sounds";
  const link = path.join(sounds, dirName);
  if (!existsSync(sounds) || path.resolve(root) === path.resolve(sounds)) return;
  try {
    lstatSync(link);
    return; // already there
  } catch {
    /* missing */
  }
  await symlink(path.join(root, dirName), link).catch(() => undefined);
}

async function buildPack(
  root: string,
  pack: Pack,
  dirName: string,
  voice?: string,
): Promise<{ written: number; skipped: number }> {
  let written = 0;
  let skipped = 0;
  const langDir = path.join(root, dirName);
  const digitDir = path.join(langDir, "digits");
  await mkdir(digitDir, { recursive: true });

  const verPath = path.join(langDir, ".announce-version");
  // A voice variant is built once in full; the base TR pack follows PACK_VERSION.
  const forcePack = (voice !== undefined || pack.lang === "tr") && (await readVersion(verPath)) !== PACK_VERSION;

  for (const [name, text] of Object.entries(pack.phrases)) {
    const fp = path.join(langDir, `${name}.wav`);
    try {
      if (forcePack && existsSync(fp)) {
        try {
          await unlink(fp);
        } catch {
          /* ignore */
        }
      }
      if (await writeClip(fp, text, pack.lang, forcePack, voice)) written++;
      else skipped++;
    } catch (e) {
      if (voice) throw e;
      console.warn(`[queue-tts] ${dirName}/${name}:`, (e as Error).message);
    }
  }

  for (const [n, text] of Object.entries(pack.digits)) {
    const fp = path.join(digitDir, `${n}.wav`);
    try {
      if (forcePack && existsSync(fp)) {
        try {
          await unlink(fp);
        } catch {
          /* ignore */
        }
      }
      if (await writeClip(fp, text, pack.lang, forcePack, voice)) written++;
      else skipped++;
    } catch (e) {
      if (voice) throw e;
      console.warn(`[queue-tts] ${dirName}/digits/${n}:`, (e as Error).message);
    }
  }

  // Position sentences (Playback(qpos/N))
  const qposDir = path.join(langDir, "qpos");
  await mkdir(qposDir, { recursive: true });
  for (let i = 1; i <= POS_MAX; i++) {
    const fp = path.join(qposDir, `${i}.wav`);
    try {
      if (forcePack && existsSync(fp)) {
        try {
          await unlink(fp);
        } catch {
          /* ignore */
        }
      }
      if (await writeClip(fp, positionSentence(pack.lang, i), pack.lang, forcePack, voice)) written++;
      else skipped++;
    } catch (e) {
      if (voice) throw e;
      console.warn(`[queue-tts] ${dirName}/qpos/${i}:`, (e as Error).message);
    }
  }

  // Hold-time sentences (optional Playback / future use; also warms cache)
  const qholdDir = path.join(langDir, "qhold");
  await mkdir(qholdDir, { recursive: true });
  for (let m = 1; m <= HOLD_MAX; m++) {
    const fp = path.join(qholdDir, `${m}.wav`);
    try {
      if (forcePack && existsSync(fp)) {
        try {
          await unlink(fp);
        } catch {
          /* ignore */
        }
      }
      if (await writeClip(fp, holdSentence(pack.lang, m), pack.lang, forcePack, voice)) written++;
      else skipped++;
    } catch (e) {
      if (voice) throw e;
      console.warn(`[queue-tts] ${dirName}/qhold/${m}:`, (e as Error).message);
    }
  }

  if (forcePack) {
    await writeFile(verPath, `${PACK_VERSION}\n`);
    await writeFile(path.join(qposDir, ".version"), `${PACK_VERSION}\n`);
  }
  return { written, skipped };
}
