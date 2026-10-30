import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { announceCalls, apiKeys, extensions, recordings, trunks } from "../db/schema.js";
import { ari } from "../asterisk/ari.js";
import { config } from "../config.js";
import { resolveOutboundDial } from "./call-policy.js";
import {
  decideAnnounceResult,
  dialReasonFromCause,
  extensionAnnounceEndpoint,
  prefixAllowed,
  rateBlock,
  webhookUrlOk,
  type AnnounceMode,
  type AnnounceReason,
} from "./announce-policy.js";

type KeyRow = typeof apiKeys.$inferSelect;

export type AnnounceRequest = {
  number: string;
  text: string;
  language: "en" | "tr";
  voice: "female" | "male" | "ema";
  mode: AnnounceMode;
  callerId?: string;
  webhookUrl?: string;
};

type Live = { aborted: boolean; wait: Promise<false>; abort: () => void };

const live = new Map<string, Live>();
const channelJobs = new Map<string, string>();
let attached = false;

function track(channelId: string): Live {
  let finish = () => {};
  const wait = new Promise<false>((resolve) => {
    finish = () => resolve(false);
  });
  const row: Live = {
    aborted: false,
    wait,
    abort: () => {
      row.aborted = true;
      finish();
    },
  };
  live.set(channelId, row);
  return row;
}

function countOf(row: { n: number | string } | undefined): number {
  return Number(row?.n ?? 0);
}

async function callCounts(keyId: string): Promise<{ recent: number; active: number }> {
  const since = new Date(Date.now() - 60_000);
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(announceCalls)
    .where(and(eq(announceCalls.apiKeyId, keyId), gte(announceCalls.createdAt, since)));
  const [active] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(announceCalls)
    .where(
      and(
        eq(announceCalls.apiKeyId, keyId),
        inArray(announceCalls.status, ["ringing", "answered"]),
      ),
    );
  return { recent: countOf(recent), active: countOf(active) };
}

async function trunkCallerId(endpoint: string): Promise<string | null> {
  const rows = await db.select({ id: trunks.id, callerId: trunks.callerId }).from(trunks);
  const row = rows.find((t) => `trunk_${t.id.slice(0, 8)}` === endpoint);
  const cli = row?.callerId?.replace(/\D/g, "") ?? "";
  return cli || null;
}

function callerIdHeader(cli: string | null): string {
  return cli ? `MonoSIP <${cli}>` : "MonoSIP";
}

async function postWebhook(
  url: string,
  body: Record<string, unknown>,
): Promise<void> {
  const payload = JSON.stringify(body);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-monosip-event": "announce.done",
        },
        body: payload,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  console.warn(`[announce] webhook failed → ${url}`);
}

export async function finishAnnounce(
  id: string,
  result: { ok: boolean; reason: AnnounceReason; digits: string | null },
  recordingId?: string | null,
): Promise<void> {
  const [row] = await db
    .update(announceCalls)
    .set({
      status: "done",
      outcome: result.ok ? "success" : "failed",
      reason: result.reason,
      digits: result.digits,
      ...(recordingId ? { recordingId } : {}),
      finishedAt: new Date(),
    })
    .where(and(eq(announceCalls.id, id), eq(announceCalls.outcome, "pending")))
    .returning();
  if (!row) return;
  if (!row.webhookUrl) return;
  await postWebhook(row.webhookUrl, {
    id: row.id,
    number: row.number,
    mode: row.resultMode,
    ok: result.ok,
    reason: result.reason,
    digits: result.digits,
    recordingId: recordingId ?? row.recordingId ?? null,
  });
}

async function failIfStillRinging(channelId: string, cause: number | undefined): Promise<void> {
  const tracked = live.get(channelId);
  if (tracked) {
    tracked.abort();
    return;
  }
  const jobId = channelJobs.get(channelId);
  channelJobs.delete(channelId);
  const [job] = jobId
    ? await db.select().from(announceCalls).where(eq(announceCalls.id, jobId)).limit(1)
    : await db
        .select()
        .from(announceCalls)
        .where(and(eq(announceCalls.channelId, channelId), eq(announceCalls.outcome, "pending")))
        .limit(1);
  if (!job || job.status !== "ringing" || job.outcome !== "pending") return;
  await finishAnnounce(job.id, {
    ok: false,
    reason: dialReasonFromCause(cause),
    digits: null,
  });
}

export function attachAnnounceRuntime(): void {
  if (attached) return;
  attached = true;
  ari.on("channelDestroyed", (channelId: string, cause?: number) => {
    void failIfStillRinging(channelId, cause);
  });
}

function recordingCandidates(name: string): string[] {
  const base = (name.split("/").pop() ?? name).replace(/\.wav$/, "");
  const file = `${base}.wav`;
  return [
    path.join(config.recordingsDir, file),
    path.join("/var/spool/asterisk/recording", file),
    path.join("/data/recordings", file),
  ];
}

async function storeRecording(channelId: string, recName: string | null): Promise<string | null> {
  if (!recName) return null;
  await new Promise((r) => setTimeout(r, 2000));
  const filePath = recordingCandidates(recName).find((p) => existsSync(p));
  if (!filePath) return null;
  let size = 0;
  try {
    size = statSync(filePath).size;
  } catch {
    return null;
  }
  if (size < 500) return null;
  const [row] = await db
    .insert(recordings)
    .values({ callId: channelId, filePath, duration: 0, sizeBytes: size })
    .returning();
  return row?.id ?? null;
}

/** Play the announcement on a channel that has just been answered into Stasis. */
export async function runAnnounceOnChannel(channelId: string, jobId: string): Promise<void> {
  const row = track(channelId);
  try {
    const [job] = await db.select().from(announceCalls).where(eq(announceCalls.id, jobId)).limit(1);
    if (!job || job.outcome !== "pending") return;
    await db
      .update(announceCalls)
      .set({ status: "answered", channelId })
      .where(eq(announceCalls.id, jobId));
    await ari.answer(channelId);

    const mode = job.resultMode as AnnounceMode;
    let recName: string | null = null;
    try {
      recName = await ari.record(channelId, `announce-${jobId}`);
    } catch {
      recName = null;
    }

    let played = false;
    let synthError = false;
    try {
      const { ensureSpeechMedia } = await import("./tts.js");
      const speech = await ensureSpeechMedia(
        job.text,
        job.language === "tr" ? "tr" : "en",
        1.05,
        job.voice,
      );
      const play = ari.playAndWait(channelId, speech.media, 120_000, {
        interruptible: mode === "dtmf",
      });
      played = await Promise.race([play, row.wait]);
      if (row.aborted) played = false;
    } catch (e) {
      synthError = true;
      console.warn("[announce] speech failed", (e as Error).message);
    }

    let digits = "";
    if (mode === "dtmf") {
      const buffered = ari.takeDtmfBuffer(channelId);
      if (!row.aborted && buffered.length < 16) {
        const more = await ari.waitDtmfDigits(channelId, {
          maxDigits: 16 - buffered.length,
          firstTimeoutMs: buffered ? 3000 : 8000,
          interDigitMs: 3000,
        });
        digits = `${buffered}${more}`.replace(/\D/g, "").slice(0, 16);
      } else {
        digits = buffered;
      }
    }

    const result = synthError && mode !== "answered"
      ? { ok: false as const, reason: "failed" as const, digits: null }
      : decideAnnounceResult({ mode, answered: true, played, digits });

    try {
      await ari.hangup(channelId);
    } catch {
      /* already gone */
    }
    const recordingId = await storeRecording(channelId, recName);
    await finishAnnounce(jobId, result, recordingId);
  } finally {
    live.delete(channelId);
    channelJobs.delete(channelId);
  }
}

export type PlaceResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export async function placeAnnounceCall(key: KeyRow, body: AnnounceRequest): Promise<PlaceResult> {
  if (!webhookUrlOk(body.webhookUrl)) {
    return { ok: false, status: 400, error: "Webhook must be https" };
  }
  if (body.voice === "ema" && body.language !== "tr") {
    return { ok: false, status: 400, error: "EMA voice is Turkish only" };
  }
  const digits = body.number.replace(/\D/g, "");
  const [extension] = /^\d{2,6}$/.test(digits)
    ? await db
        .select({ number: extensions.number })
        .from(extensions)
        .where(eq(extensions.number, digits))
        .limit(1)
    : [];
  const prefixes = (key.prefixes as string[]) ?? [];
  if (!extension && !prefixAllowed(body.number, prefixes)) {
    return { ok: false, status: 403, error: "Number prefix not allowed" };
  }
  const counts = await callCounts(key.id);
  const block = rateBlock({
    perMinute: key.callsPerMinute,
    recent: counts.recent,
    maxConcurrent: key.maxConcurrent,
    active: counts.active,
  });
  if (block) return { ok: false, status: 429, error: "Rate limit" };

  const [job] = await db
    .insert(announceCalls)
    .values({
      apiKeyId: key.id,
      number: body.number,
      text: body.text,
      language: body.language,
      voice: body.voice,
      resultMode: body.mode,
      callerId: body.callerId ?? null,
      webhookUrl: body.webhookUrl || null,
    })
    .returning();

  const internal = extensionAnnounceEndpoint(extension?.number ?? null);
  const route = internal ? null : await resolveOutboundDial(body.number);
  if (!internal && !route) {
    await finishAnnounce(job.id, { ok: false, reason: "failed", digits: null });
    return { ok: true, status: 201, body: { id: job.id, status: "done", ok: false, reason: "failed" } };
  }

  const targets = internal
    ? [internal]
    : [route!.trunkEndpoint, ...route!.fallbackEndpoints].map(
        (endpoint) => `PJSIP/${route!.dialNumber}@${endpoint}`,
      );
  const channelId = `announce-${job.id}`;
  channelJobs.set(channelId, job.id);
  let dialed: { id?: string } | null = null;
  let usedEndpoint = targets[0];
  for (const endpoint of targets) {
    const trunk = endpoint.includes("@") ? endpoint.slice(endpoint.lastIndexOf("@") + 1) : "";
    const cli = body.callerId?.replace(/\D/g, "") || (trunk ? await trunkCallerId(trunk) : "");
    try {
      dialed = await ari.originateApp({
        endpoint,
        app: "monosip-flow",
        appArgs: `announce,${job.id}`,
        callerId: callerIdHeader(cli || null),
        timeout: 45,
        channelId,
      });
      usedEndpoint = endpoint;
      break;
    } catch (e) {
      console.warn(`[announce] originate ${endpoint} failed`, (e as Error).message);
      dialed = null;
    }
  }
  if (!dialed?.id) {
    channelJobs.delete(channelId);
    await finishAnnounce(job.id, { ok: false, reason: "failed", digits: null });
    return { ok: true, status: 201, body: { id: job.id, status: "done", ok: false, reason: "failed" } };
  }
  const actualId = dialed.id;
  if (actualId !== channelId) {
    channelJobs.delete(channelId);
    channelJobs.set(actualId, job.id);
  }
  const [current] = await db.select().from(announceCalls).where(eq(announceCalls.id, job.id)).limit(1);
  if (!current || current.outcome !== "pending") {
    return {
      ok: true,
      status: 201,
      body: {
        id: job.id,
        status: "done",
        ok: current?.outcome === "success",
        reason: current?.reason ?? "failed",
      },
    };
  }
  await db
    .update(announceCalls)
    .set({ channelId: actualId })
    .where(eq(announceCalls.id, job.id));
  console.log(`[announce] ${job.id} → ${usedEndpoint}`);
  return { ok: true, status: 201, body: { id: job.id, status: "ringing" } };
}

export function announcePublic(row: typeof announceCalls.$inferSelect) {
  return {
    id: row.id,
    number: row.number,
    text: row.text,
    language: row.language,
    voice: row.voice,
    mode: row.resultMode,
    callerId: row.callerId,
    status: row.status,
    ok: row.outcome === "pending" ? null : row.outcome === "success",
    reason: row.reason,
    digits: row.digits,
    recordingId: row.recordingId,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}

export function openRecording(filePath: string) {
  if (!existsSync(filePath)) return null;
  const ext = filePath.split(".").pop()?.toLowerCase();
  const type = ext === "wav" ? "audio/wav" : ext === "ogg" || ext === "opus" ? "audio/ogg" : "application/octet-stream";
  return { stream: createReadStream(filePath), type };
}
