import type { FlowJson } from "@monosip/shared";
import { SettingsSchema } from "@monosip/shared";
import { and, eq, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { config } from "../config.js";
import {
  callEvents,
  extensions,
  flows,
  lastDialAttempts,
  mohClasses,
  missedCalls,
  queues,
  recordings,
  ringGroups,
  settings,
} from "../db/schema.js";
import { dispatchWebhooks } from "../lib/webhooks.js";
import { ari } from "./ari.js";
import { speakChunked, speakThenCollectDigit } from "./speech.js";
import {
  evaluateScheduleStatus,
  isBlacklisted,
  loadPublishedFlow,
  resolveDestination,
  resolveInbound,
  type ResolvedInbound,
} from "./routing.js";
import {
  compare,
  conditionLeft,
  dialStatusToHandle,
  expandTemplate,
  jsonPath,
  matchDirectoryExtension,
  menuHasExit,
  nextNode,
} from "./flow-logic.js";
import path from "node:path";
import { silenceMedia } from "../lib/silence.js";

async function notifyMissedCall(caller: string, did: string) {
  try {
    const [row] = await db.select().from(settings).limit(1);
    const s = SettingsSchema.parse(row?.data ?? {});
    if (!s.smtpHost || !s.smtpTo) return;
    const { sendSmtpMail } = await import("../lib/smtp.js");
    await sendSmtpMail(
      {
        host: s.smtpHost,
        port: s.smtpPort,
        user: s.smtpUser,
        password: s.smtpPassword,
        from: s.emailFrom,
        to: s.smtpTo,
      },
      `MonoSIP missed call from ${caller}`,
      `Missed call\nCaller: ${caller}\nDID: ${did}\nAt: ${new Date().toISOString()}`,
    );
  } catch (e) {
    console.warn("[flow] missed-call email failed", (e as Error).message);
  }
}

type PendingTransfer = {
  flow: FlowJson;
  nodeId: string;
  vars: Record<string, string>;
  depth: number;
};

/** Resume flow after monosip-flow-dial returns to Stasis with dial-failed. */
const pendingTransfers = new Map<string, PendingTransfer>();

/**
 * Follow a transfer dial-status exit (noanswer / busy / chanunavail). Matching is
 * strict so a busy call never wanders down another exit's edge; with no exit
 * wired the caller goes back to the menu, or the call ends when there is none.
 */
export function dialExitNode(
  flow: FlowJson,
  nodeId: string,
  handle: string,
): FlowJson["nodes"][number] | undefined {
  return nextNode(flow, nodeId, handle, true) ?? flow.nodes.find((n) => n.type === "menu");
}

/** Longest pause a wait node may hold a call (seconds). */
export const MAX_WAIT_SECONDS = 600;

/** Hard cap on nodes run per call, so a flow that loops back to a menu can't run forever. */
export const MAX_FLOW_STEPS = 300;

/** WebRTC ICE/RTP often not ready immediately after answer — early play becomes a short beep then silence. */
export const MEDIA_SETTLE_MS = 900;

/** Silence played before the flow hangs up, so the last words reach the caller. */
export const HANGUP_TAIL_MS = 800;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Keep RTP flowing for `ms` with a near-silent clip (see lib/silence.ts) instead
 * of sleeping: after a silent gap the caller's jitter buffer clips the next
 * prompt's first syllable. Falls back to a plain sleep.
 */
async function playSilence(channelId: string, ms: number): Promise<void> {
  const clips = [...Array<number>(Math.floor(ms / 1000)).fill(1000)];
  if (ms % 1000 >= 100) clips.push(Math.round((ms % 1000) / 100) * 100);
  for (const [i, clipMs] of clips.entries()) {
    const media = await silenceMedia(clipMs).catch(() => null);
    // playAndWait resolves false when the channel is gone or playback could not start
    if (!media || (await ari.playAndWait(channelId, media, clipMs + 3000)) === false) {
      await sleep(clips.slice(i).reduce((a, b) => a + b, 0));
      return;
    }
  }
}

/** Let the last prompt drain out of the caller's jitter buffer, then hang up. */
async function hangupAfterTail(channelId: string): Promise<void> {
  await playSilence(channelId, HANGUP_TAIL_MS);
  await ari.hangup(channelId);
}

/** Node language wins when set; otherwise flow `language` variable / English. */
export function resolveSpeechLang(
  data: Record<string, unknown>,
  vars: Record<string, string>,
): "en" | "tr" {
  const raw = String(data.language ?? "").trim().toLowerCase();
  if (raw === "tr" || raw.startsWith("tr")) return "tr";
  if (raw === "en" || raw.startsWith("en")) return "en";
  return vars.language === "tr" ? "tr" : "en";
}

/**
 * Voice chosen on the node wins. Settings → IVR TTS is only the fallback for
 * "system default", and only while apply-all is on. An explicit male/EMA/female
 * on a greeting must be heard even when the rest of the IVR shares one model.
 */
function resolveTtsVoice(
  data: Record<string, unknown> | undefined,
  vars: Record<string, string>,
): string {
  const raw = String(data?.gender ?? data?.voice ?? "").trim();
  if (raw && raw !== "default") return raw;
  if (vars.__ttsApplyAll === "0") return "female";
  return (vars.__ttsVoice || "female").trim() || "female";
}

/** Hold-music class for a transfer. The class chosen in Settings wins when it has a file. */
async function transferHoldClass(): Promise<string> {
  try {
    const rows = await db.select().from(mohClasses);
    const usable = rows.filter(
      (r) => Array.isArray(r.files) && r.files.length > 0 && !/[\r\n;]/.test(r.name),
    );
    const [srow] = await db.select().from(settings).limit(1);
    const chosen = String(
      (srow?.data as { holdMusicClass?: string } | null | undefined)?.holdMusicClass ?? "",
    ).trim();
    if (chosen && usable.some((r) => r.name === chosen)) return chosen;
    return (usable.find((r) => r.name === "default") ?? usable[0])?.name ?? "default";
  } catch {
    return "default";
  }
}

async function playSpeech(
  channelId: string,
  text: string,
  lang: "en" | "tr" = "en",
  gender: string = "female",
): Promise<void> {
  try {
    await speakChunked(channelId, text, lang, gender, { tag: "tts" });
  } catch (e) {
    console.warn(`[flow] playSpeech failed`, (e as Error).message);
    await ari.playAndWait(channelId, "sound:beep", 2000).catch(() => sleep(300));
  }
}

/**
 * Recording notice immediately before a person is rung. The IVR itself stays
 * quiet. Dialplan skips a second play when KVKK_DONE is already set.
 */
async function playKvkkBeforePerson(channelId: string, vars: Record<string, string>): Promise<void> {
  if (vars.__kvkkPlayed === "1") return;
  try {
    const [row] = await db.select().from(settings).limit(1);
    const s = SettingsSchema.parse(row?.data ?? {});
    if (!s.kvkkAnnouncementEnabled) return;
    console.log(`[flow] ${channelId} KVKK announcement`);
    let played = false;
    if (s.kvkkPromptId) {
      try {
        const { prompts: promptsTable } = await import("../db/schema.js");
        const { promptMediaUri } = await import("../lib/tts.js");
        const [pr] = await db
          .select()
          .from(promptsTable)
          .where(eq(promptsTable.id, s.kvkkPromptId));
        const media = promptMediaUri(pr?.filePath, s.kvkkPromptId);
        if (media) {
          await ari.playAndWait(channelId, media, 60_000);
          played = true;
        }
      } catch (e) {
        console.warn(`[flow] KVKK prompt failed`, (e as Error).message);
      }
    }
    if (!played) {
      try {
        const { ensureSpeechMedia } = await import("../lib/tts.js");
        const lang = vars.language === "en" ? "en" : "tr";
        const text =
          lang === "tr"
            ? "Aramanız kalite standartları gereği kayıt altına alınmaktadır."
            : "This call may be recorded.";
        const { media, cached, ms } = await ensureSpeechMedia(text, lang, 1.05, "female");
        console.log(`[flow] ${channelId} kvkk-tts ${cached ? "cache" : "synth"} ${ms}ms`);
        await ari.playAndWait(channelId, media, 60_000);
        played = true;
      } catch (e) {
        console.warn(`[flow] KVKK TTS failed`, (e as Error).message);
      }
    }
    if (played) {
      vars.__kvkkPlayed = "1";
      await ari.setChannelVar(channelId, "KVKK_DONE", "1");
      await ari.setChannelVar(channelId, "__KVKK_DONE", "1");
    }
  } catch (e) {
    console.warn(`[flow] KVKK announcement failed`, (e as Error).message);
  }
}

/** Exported for unit testing: maps a resolved destination onto ARI actions. */
export async function applyResolved(
  channelId: string,
  resolved: ResolvedInbound,
  vars: Record<string, string>,
): Promise<void> {
  switch (resolved.kind) {
    case "hangup":
      console.log(`[flow] ${channelId} hangup: ${resolved.reason}`);
      await ari.hangup(channelId);
      return;
    case "extension":
    case "queue":
    case "ring_group":
      await playKvkkBeforePerson(channelId, vars);
      await ari.redirect(channelId, resolved.number, "from-internal");
      return;
    case "voicemail":
      await ari.redirect(channelId, `*${resolved.extension}`, "from-internal");
      return;
    case "flow":
      await runFlowOnChannel(channelId, resolved.flow, vars);
      return;
  }
}

async function runFlowFromNode(
  channelId: string,
  flow: FlowJson,
  startNode: FlowJson["nodes"][number],
  vars: Record<string, string>,
  depth = 0,
): Promise<void> {
  if (depth > 5) {
    await ari.hangup(channelId);
    return;
  }
  const startRecordingOnce = async () => {
    /* no-op on resume — recording already decided at flow entry */
  };
  const visited = new Set<string>();
  await executeFlowLoop(channelId, flow, vars, depth, startNode, visited, startRecordingOnce);
}

/** Exported for unit testing: answers the channel and runs the flow graph. */
export async function runFlowOnChannel(
  channelId: string,
  flow: FlowJson,
  vars: Record<string, string>,
  depth = 0,
  /** When true, exhausting nodes returns to parent instead of hanging up. */
  asSubflow = false,
): Promise<"ok" | "left"> {
  if (depth > 5) {
    if (!asSubflow) await ari.hangup(channelId);
    return "left";
  }
  if (!asSubflow) {
    await ari.answer(channelId);
    await playSilence(channelId, MEDIA_SETTLE_MS);
  }

  // Settings voice fills greetings left on system default. A voice set on the node wins.
  try {
    const [row] = await db.select().from(settings).limit(1);
    const s = SettingsSchema.parse(row?.data ?? {});
    vars.__ttsVoice = (s.ttsVoice || "female").trim() || "female";
    vars.__ttsApplyAll = s.ttsVoiceApplyAll === false ? "0" : "1";
  } catch {
    vars.__ttsVoice = vars.__ttsVoice || "female";
    vars.__ttsApplyAll = vars.__ttsApplyAll || "1";
  }

  // Defer channel recording until after IVR audio — early MixMonitor/record breaks WebRTC playback
  let recordingStarted = false;
  const startRecordingOnce = async () => {
    if (recordingStarted) return;
    recordingStarted = true;
    try {
      let allowRec = true;
      const extNum = vars.caller || vars.extension || "";
      if (extNum) {
        const [ext] = await db.select().from(extensions).where(eq(extensions.number, extNum)).limit(1);
        if (ext) {
          if (ext.recordingMode === "off") allowRec = false;
          const perms = (ext.callPermissions ?? {}) as { recording?: boolean };
          if (perms.recording === false) allowRec = false;
        }
      }
      if (!allowRec) return;
      const name = `rec-${channelId.replace(/\W/g, "")}`;
      const recName = await ari.record(channelId, name);
      if (recName) {
        const filePath = path.join(config.recordingsDir, `${recName}.wav`);
        await db.insert(recordings).values({
          callId: channelId,
          filePath,
          duration: 0,
        });
      }
    } catch {
      /* optional */
    }
  };

  // Snoop recording does not block IVR playback. Start it with the call so the
  // menu and the later transfer are both kept. A transfer/queue calls this again;
  // the flag makes that a no-op.
  if (!asSubflow) await startRecordingOnce();

  let node = flow.nodes.find((n) => n.type === "start");
  const visited = new Set<string>();
  return executeFlowLoop(channelId, flow, vars, depth, node, visited, startRecordingOnce, asSubflow);
}

/** Exported for unit testing: the node-type dispatch loop. */
export async function executeFlowLoop(
  channelId: string,
  flow: FlowJson,
  vars: Record<string, string>,
  depth: number,
  startNode: FlowJson["nodes"][number] | undefined,
  visited: Set<string>,
  startRecordingOnce: () => Promise<void>,
  asSubflow = false,
): Promise<"ok" | "left"> {
  let node = startNode;
  let steps = 0;

  while (node && !visited.has(node.id)) {
    if (++steps > MAX_FLOW_STEPS) {
      console.warn(`[flow] ${channelId} step limit ${MAX_FLOW_STEPS} reached — hanging up`);
      break;
    }
    visited.add(node.id);
    const data = node.data as Record<string, unknown>;
    let handle: string | undefined;
    /** Jump back to a node (e.g. menu after failed transfer) without following edges. */
    let jumpTo: FlowJson["nodes"][number] | undefined;

    try {
      await db.insert(callEvents).values({
        callId: channelId,
        type: "flow.node",
        data: { nodeId: node.id, nodeType: node.type, label: data.label ?? data.name ?? null },
      });
    } catch {
      /* ignore */
    }

    switch (node.type) {
      case "start":
        break;
      case "announce":
      case "tts": {
        const text = expandTemplate(
          String(data.text ?? data.prompt ?? data.ttsText ?? "Welcome"),
          vars,
        );
        console.log(`[flow] ${channelId} ${node.type}: ${text}`);
        const promptId = data.promptId ? String(data.promptId) : "";
        let played = false;
        if (promptId) {
          try {
            const { prompts: promptsTable } = await import("../db/schema.js");
            const { promptMediaUri } = await import("../lib/tts.js");
            const [pr] = await db.select().from(promptsTable).where(eq(promptsTable.id, promptId));
            const media = promptMediaUri(pr?.filePath, promptId);
            if (media) {
              await ari.playAndWait(channelId, media, 60_000);
              played = true;
            }
          } catch (e) {
            console.warn(`[flow] prompt play failed`, (e as Error).message);
          }
        }
        if (!played && text) {
          try {
            const lang = resolveSpeechLang(data, vars);
            const gender = resolveTtsVoice(data, vars);
            // Sentence by sentence: playback starts after the first chunk, not the whole text
            const r = await speakChunked(channelId, text, lang, gender, { tag: "live-tts" });
            played = r.played;
          } catch (e) {
            console.warn(`[flow] live TTS failed`, (e as Error).message);
          }
        }
        if (!played) {
          await ari.playAndWait(channelId, "sound:beep", 2000).catch(() => sleep(400));
        }
        break;
      }
      case "menu": {
        // Clear stale digits on entry — not after the prompt is synthesized/played:
        // callers who know the menu press ahead, and that key must count.
        ari.clearDtmfBuffer(channelId);
        const prompt = expandTemplate(String(data.prompt ?? data.text ?? "menu"), vars);
        console.log(`[flow] ${channelId} menu: ${prompt}`);
        const timeoutMs = Number(data.timeoutMs ?? 12000);
        const maxDigits = Math.max(1, Math.min(12, Number(data.maxDigits ?? 1) || 1));
        const retries = Math.max(0, Math.min(5, Number(data.retries ?? 2) || 0));
        const lang = resolveSpeechLang(data, vars);
        const gender = resolveTtsVoice(data, vars);
        // Prompt is spoken in chunks (cached per chunk, so retries are instant);
        // a key pressed while it plays stops it and is taken as the choice.
        let attempt = 0;
        let chosen: string | null = null;
        while (attempt <= retries) {
          let collected = "";
          try {
            if (maxDigits <= 1) {
              collected =
                (await speakThenCollectDigit(channelId, prompt, lang, gender, timeoutMs, { clear: attempt > 0 })) ??
                "";
            } else {
              if (attempt > 0) ari.clearDtmfBuffer(channelId);
              await speakChunked(channelId, prompt, lang, gender, { interruptible: true, tag: "menu-tts" });
              collected = await ari.waitDtmfDigits(channelId, {
                maxDigits,
                firstTimeoutMs: timeoutMs,
                interDigitMs: 2500,
              });
            }
          } catch (e) {
            console.warn(`[flow] menu collect failed`, (e as Error).message);
            collected =
              maxDigits <= 1
                ? ((await ari.waitDtmf(channelId, timeoutMs)) ?? "")
                : await ari.waitDtmfDigits(channelId, {
                    maxDigits,
                    firstTimeoutMs: timeoutMs,
                  });
          }
          if (!collected) {
            chosen = "timeout";
            break;
          }
          if (menuHasExit(flow, node.id, collected)) {
            chosen = collected;
            break;
          }
          // Wrong digit — retry or invalid
          attempt++;
          if (attempt > retries) {
            chosen = menuHasExit(flow, node.id, "invalid") ? "invalid" : "timeout";
            break;
          }
          await playSpeech(
            channelId,
            lang === "tr" ? "Geçersiz tuş. Lütfen tekrar deneyin." : "Invalid entry. Please try again.",
            lang,
            gender,
          ).catch(() => undefined);
        }
        handle = chosen ?? "timeout";
        vars.dtmf = handle;
        console.log(`[flow] ${channelId} DTMF=${handle}`);
        try {
          await db.insert(callEvents).values({
            callId: channelId,
            type: "ivr.dtmf",
            data: { digit: handle, nodeId: node.id },
          });
        } catch {
          /* ignore */
        }
        // Resolve next with strict matching so wrong digits never take another key's edge
        const menuNext = nextNode(flow, node.id, handle, true);
        if (menuNext) {
          jumpTo = menuNext;
          break;
        }
        await ari.hangup(channelId);
        return "left";
      }
      case "get_key": {
        const varName = String(data.name ?? data.variable ?? "digits").trim() || "digits";
        const prompt = expandTemplate(String(data.prompt ?? data.text ?? ""), vars);
        const timeoutMs = Number(data.timeoutMs ?? 12000);
        const maxDigits = Math.max(1, Math.min(24, Number(data.maxDigits ?? 4) || 4));
        const minDigits = Math.max(0, Math.min(maxDigits, Number(data.minDigits ?? 1) || 1));
        const lang = resolveSpeechLang(data, vars);
        const gender = resolveTtsVoice(data, vars);
        console.log(`[flow] ${channelId} get_key → $${varName} max=${maxDigits}`);
        // Clear stale digits on entry; digits typed during the prompt count (type-ahead).
        ari.clearDtmfBuffer(channelId);
        if (prompt) {
          // Typing the code while the prompt plays stops it (digits stay buffered).
          await speakChunked(channelId, prompt, lang, gender, { interruptible: true, tag: "get_key-tts" }).catch(
            (e: unknown) => console.warn(`[flow] get_key prompt failed`, (e as Error).message),
          );
        }
        const collected = await ari.waitDtmfDigits(channelId, {
          maxDigits,
          firstTimeoutMs: timeoutMs,
          interDigitMs: Number(data.interDigitMs ?? 3000) || 3000,
        });
        if (!collected || collected.length < minDigits) {
          handle = "timeout";
          vars[varName] = collected || "";
          vars.dtmf = "";
          console.log(`[flow] ${channelId} get_key timeout (got="${collected}")`);
        } else {
          vars[varName] = collected;
          vars.dtmf = collected;
          handle = "next";
          console.log(`[flow] ${channelId} get_key $${varName}=${collected}`);
        }
        try {
          await db.insert(callEvents).values({
            callId: channelId,
            type: "ivr.get_key",
            data: { var: varName, digits: collected || null, nodeId: node.id, handle },
          });
        } catch {
          /* ignore */
        }
        break;
      }
      case "api": {
        const url = expandTemplate(String(data.url ?? ""), vars);
        const method = String(data.method ?? "GET").toUpperCase();
        const timeoutMs = Number(data.timeoutMs ?? 3000);
        const retries = Math.min(1, Math.max(0, Number(data.retry ?? 0) || 0));
        let headers: Record<string, string> = {};
        for (const [k, v] of Object.entries((data.headers as Record<string, string>) ?? {})) {
          headers[k] = expandTemplate(String(v), vars);
        }
        // Inject auth from encrypted secrets table (never store tokens in flow JSON)
        const authType = String(data.authType ?? "none");
        const secretId = String(data.secretId ?? "");
        if (secretId && authType !== "none") {
          try {
            const { secrets } = await import("../db/schema.js");
            const { decrypt } = await import("../lib/crypto.js");
            const [sec] = await db.select().from(secrets).where(eq(secrets.id, secretId)).limit(1);
            if (sec) {
              const token = decrypt(sec.valueEnc);
              if (authType === "bearer") headers = { ...headers, Authorization: `Bearer ${token}` };
              else if (authType === "basic") headers = { ...headers, Authorization: `Basic ${token}` };
              else if (authType === "header") {
                const hdr = String(data.authHeader ?? "X-Api-Key");
                headers = { ...headers, [hdr]: token };
              }
            }
          } catch (e) {
            console.warn(`[flow] secret inject failed`, (e as Error).message);
          }
        }
        // Optional wait announce / MOH while request runs
        let waitPlayback: string | null = null;
        const waitPromptId = String(data.waitPromptId ?? "");
        if (waitPromptId) {
          try {
            const { prompts: promptsTable } = await import("../db/schema.js");
            const { promptMediaUri } = await import("../lib/tts.js");
            const [pr] = await db.select().from(promptsTable).where(eq(promptsTable.id, waitPromptId));
            const media = promptMediaUri(pr?.filePath, waitPromptId);
            if (media) waitPlayback = await ari.play(channelId, media);
          } catch {
            /* ignore */
          }
        } else if (data.waitMedia) {
          try {
            const wm = String(data.waitMedia);
            waitPlayback = await ari.play(channelId, wm.startsWith("sound:") ? wm : `sound:${wm}`);
          } catch {
            /* ignore */
          }
        } else if (data.waitMoh) {
          try {
            await ari.setChannelVar(channelId, "CHANNEL(musicclass)", String(data.waitMoh));
            // Best-effort presence tone while HTTP runs (full MOH needs dialplan hold)
            await ari.play(channelId, "sound:beep");
          } catch {
            /* ignore */
          }
        }
        const bodyTpl =
          method !== "GET" && method !== "HEAD" && data.body
            ? expandTemplate(String(data.body), vars)
            : undefined;
        const doFetch = async () =>
          fetch(url, {
            method,
            signal: AbortSignal.timeout(timeoutMs),
            headers,
            body: bodyTpl,
          });
        try {
          let res = await doFetch();
          if (!res.ok && retries > 0) {
            await sleep(400);
            res = await doFetch();
          }
          vars.http_status = String(res.status);
          if (res.ok) {
            const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
            const mappings = (data.mappings as Array<{ path: string; var: string }>) ?? [];
            for (const m of mappings) {
              vars[m.var] = String(jsonPath(json, m.path) ?? "");
            }
            handle = "success";
          } else {
            handle = "error";
          }
        } catch (e) {
          console.warn(`[flow] API failed`, (e as Error).message);
          if (retries > 0) {
            try {
              await sleep(400);
              const res = await doFetch();
              vars.http_status = String(res.status);
              if (res.ok) {
                const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
                const mappings = (data.mappings as Array<{ path: string; var: string }>) ?? [];
                for (const m of mappings) {
                  vars[m.var] = String(jsonPath(json, m.path) ?? "");
                }
                handle = "success";
              } else handle = "error";
            } catch (e2) {
              console.warn(`[flow] API retry failed`, (e2 as Error).message);
              handle = "error";
            }
          } else {
            handle = "error";
          }
        } finally {
          if (waitPlayback) void ari.stopPlayback(waitPlayback);
        }
        break;
      }
      case "condition": {
        const op = String(data.op ?? "=");
        const varName = String(data.variable ?? "");
        const left = conditionLeft(vars, varName, op);
        const right = String(data.value ?? "");
        handle = compare(left, right, op) ? "true" : "false";
        break;
      }
      case "set_var":
        vars[String(data.name ?? "var")] = expandTemplate(String(data.value ?? ""), vars);
        break;
      case "wait": {
        // Pause N seconds (optionally with hold music), then continue on "next".
        const seconds = Math.max(1, Math.min(MAX_WAIT_SECONDS, Number(data.seconds ?? 5) || 5));
        const moh = String(data.moh ?? "").trim();
        console.log(`[flow] ${channelId} wait ${seconds}s${moh ? ` (moh ${moh})` : ""}`);
        const withMoh = moh ? await ari.startMoh(channelId, moh === "default" ? undefined : moh) : false;
        if (withMoh) {
          await sleep(seconds * 1000);
          await ari.stopMoh(channelId);
        } else {
          await playSilence(channelId, seconds * 1000);
        }
        break;
      }
      case "language":
        vars.language = String(data.language ?? "en");
        break;
      case "time_condition": {
        const scheduleId = String(data.scheduleId ?? "");
        if (scheduleId) {
          const status = await evaluateScheduleStatus(scheduleId);
          handle = status;
        } else {
          handle = "closed";
        }
        break;
      }
      case "directory": {
        console.log(`[flow] ${channelId} directory search`);
        const lang = (
          data.language === "tr" || data.language === "en"
            ? data.language
            : vars.language === "tr"
              ? "tr"
              : "en"
        ) as "en" | "tr";
        const firstTimeoutMs = Math.max(3000, Math.min(60000, Number(data.timeoutMs ?? 10000) || 10000));
        const maxDigits = Math.max(1, Math.min(12, Number(data.maxDigits ?? 8) || 8));
        await playSpeech(
          channelId,
          lang === "tr"
            ? "Aradığınız kişinin soyadını tuşlayın, sonra diyez basın."
            : "Enter the last name on your keypad, then press pound.",
          lang,
          resolveTtsVoice(data, vars),
        );
        ari.clearDtmfBuffer(channelId);
        const digits = await ari.waitDtmfDigits(channelId, {
          maxDigits,
          firstTimeoutMs,
          interDigitMs: 3000,
        });
        if (digits) {
          const all = await db.select().from(extensions);
          const hit = matchDirectoryExtension(all, digits);
          if (hit) {
            vars.directory_ext = hit.number;
            handle = "found";
            await playSpeech(
              channelId,
              lang === "tr"
                ? `${hit.name}, bağlanıyor.`
                : `Connecting to ${hit.name}.`,
              lang,
              resolveTtsVoice(data, vars),
            );
            await ari.redirect(channelId, hit.number, "from-internal");
            return "left";
          }
        }
        handle = "not_found";
        await playSpeech(
          channelId,
          lang === "tr" ? "Eşleşme bulunamadı." : "No match found.",
          lang,
          resolveTtsVoice(data, vars),
        );
        break;
      }
      case "subflow": {
        const subId = String(data.flowId ?? "");
        const sub = await loadPublishedFlow(subId || undefined);
        if (sub) {
          const subResult = await runFlowOnChannel(channelId, sub, vars, depth + 1, true);
          if (subResult === "left") return "left";
          handle = "return";
          break;
        }
        handle = "return";
        break;
      }
      case "transfer": {
        let dest = String(data.destId ?? "");
        const destType = String(data.destType ?? "extension");
        const caller = vars.caller || "";
        const ringTimeout = Math.max(5, Math.min(120, Number(data.timeout ?? data.ringSeconds ?? 30) || 30));
        // Resolve UUID → extension number (legacy DestPicker stored ids)
        if (destType === "extension" && dest) {
          const { resolveExtensionNumber } = await import("./routing.js");
          const all = await db.select().from(extensions);
          dest = resolveExtensionNumber(dest, all) ?? dest;
        }
        console.log(`[flow] ${channelId} transfer → ${destType}:${dest} (caller=${caller})`);
        await startRecordingOnce();
        if (!dest) {
          await ari.hangup(channelId);
          return "left";
        }
        // Softphone testing: option "1 → 101" while registered as 101 = self-dial → silence
        if (destType === "extension" && dest === caller) {
          console.warn(`[flow] ${channelId} refused self-transfer to ${dest}`);
          const exit = dialExitNode(flow, node.id, "chanunavail");
          if (!exit) {
            await ari.hangup(channelId);
            return "left";
          }
          jumpTo = exit;
          break;
        }
        if (destType === "extension") {
          const { online, busy } = await ari.endpointState(dest);
          if (!online) {
            console.warn(`[flow] ${channelId} target ${dest} offline`);
            const exit = dialExitNode(flow, node.id, "chanunavail");
            if (!exit) {
              await ari.hangup(channelId);
              return "left";
            }
            jumpTo = exit;
            break;
          }
          // Already on a call: phones with call waiting would just ring until the
          // timeout (NOANSWER), so take the busy exit without dialing.
          if (busy) {
            console.warn(`[flow] ${channelId} target ${dest} busy`);
            const exit = dialExitNode(flow, node.id, "busy");
            if (!exit) {
              await ari.hangup(channelId);
              return "left";
            }
            jumpTo = exit;
            break;
          }
          // Dial in dialplan; on failure Stasis resumes with dial-failed + DIALSTATUS
          pendingTransfers.set(channelId, {
            flow,
            nodeId: node.id,
            vars: { ...vars },
            depth,
          });
          await ari.setChannelVar(channelId, "MONOSIP_DIAL_TARGET", dest);
          await ari.setChannelVar(channelId, "MONOSIP_DIAL_TIMEOUT", String(ringTimeout));
          await ari.setChannelVar(channelId, "MONOSIP_DIAL_MOH", await transferHoldClass());
          await playKvkkBeforePerson(channelId, vars);
          await ari.redirect(channelId, "s", "monosip-flow-dial");
          return "left";
        }
        // Non-extension destinations: redirect (no DialStatus edges)
        const resolved = await resolveDestination({ destType, destId: dest });
        await applyResolved(channelId, resolved, vars);
        return "left";
      }
      case "queue": {
        const q = String(data.queueNumber ?? data.queueId ?? "");
        await startRecordingOnce();
        if (q) {
          // VIP: flow var vip=true / priority / node data → Asterisk QUEUE_PRIO
          const vip =
            String(vars.vip ?? data.vip ?? "").toLowerCase() === "true" ||
            vars.vip === "1" ||
            data.vip === true;
          const prioRaw = data.priority ?? vars.priority ?? (vip ? "10" : "0");
          const prio = Math.max(0, Math.min(99, Number(prioRaw) || 0));
          if (prio > 0 || vip) {
            const finalPrio = prio > 0 ? prio : 10;
            await ari.setChannelVar(channelId, "QUEUE_PRIO", String(finalPrio));
            console.log(`[flow] ${channelId} QUEUE_PRIO=${finalPrio} vip=${vip} → ${q}`);
          }
          const resolved = await resolveDestination({ destType: "queue", destId: q });
          await applyResolved(channelId, resolved, vars);
          return "left";
        }
        await ari.hangup(channelId);
        return "left";
      }
      case "voicemail": {
        const ext = String(data.extensionId ?? data.extension ?? "");
        if (!ext) {
          await ari.hangup(channelId);
          return "left";
        }
        const vmLang = resolveSpeechLang(data, vars);
        const custom = data.prompt ?? data.text;
        const greeting =
          custom == null
            ? vmLang === "tr"
              ? "Mesajınızı bip sesinden sonra bırakabilirsiniz."
              : "Please leave your message after the tone."
            : String(custom).trim();
        if (greeting) await playSpeech(channelId, greeting, vmLang, resolveTtsVoice(data, vars));
        await ari.redirect(channelId, `*${ext}`, "monosip-voicemail");
        return "left";
      }
      case "hangup":
        try {
          await db.insert(callEvents).values({
            callId: channelId,
            type: "flow.exit",
            data: { nodeId: node.id, nodeType: node.type, reason: "hangup" },
          });
        } catch {
          /* ignore */
        }
        await hangupAfterTail(channelId);
        return "left";
      default:
        console.log(`[flow] ${channelId} skip node type=${node.type}`);
        break;
    }

    if (jumpTo) {
      visited.delete(jumpTo.id);
      node = jumpTo;
      continue;
    }

    const nxt = nextNode(flow, node.id, handle);
    if (!nxt) {
      if (asSubflow) return "ok";
      await hangupAfterTail(channelId);
      return "left";
    }
    // Menus and key prompts wait for the caller, so edges back to them ("return to
    // the main menu", "enter another code") start a fresh pass: the caller may pick
    // the same branch again. Loops without caller input are still caught by
    // `visited` (and MAX_FLOW_STEPS).
    if (nxt.type === "menu" || nxt.type === "get_key") visited.clear();
    node = nxt;
  }
  if (asSubflow) return "ok";
  await hangupAfterTail(channelId);
  return "left";
}

/** True when `number` has its own from-internal extension (not the _X. catch-all). */
async function isInternalDestination(number: string): Promise<boolean> {
  const [ext, queue, ring, flow] = await Promise.all([
    db.select({ id: extensions.id }).from(extensions).where(eq(extensions.number, number)).limit(1),
    db.select({ id: queues.id }).from(queues).where(eq(queues.number, number)).limit(1),
    db.select({ id: ringGroups.id }).from(ringGroups).where(eq(ringGroups.number, number)).limit(1),
    db.select({ id: flows.id }).from(flows).where(eq(flows.extensionNumber, number)).limit(1),
  ]);
  return ext.length + queue.length + ring.length + flow.length > 0;
}

/** Exported for unit testing: outbound policy check and route origination. */
export async function handleOutbound(channelId: string, dialed: string, caller: string) {
  const { cdrStart, cdrEnd, cdrAnswered } = await import("../lib/cdr.js");
  const {
    checkExtensionOutbound,
    isEmergencyNumber,
    resolveOutboundDial,
    loadSettings,
  } = await import("../lib/call-policy.js");

  await cdrStart({
    callId: channelId,
    direction: "outbound",
    caller,
    callee: dialed,
    extensionNumber: caller,
  });

  if (await isBlacklisted(dialed, "outbound")) {
    console.log(`[flow] outbound blocked blacklist ${dialed}`);
    await cdrEnd(channelId, "BUSY");
    await ari.hangup(channelId);
    return;
  }

  // 112 / emergency always allowed
  if (isEmergencyNumber(dialed)) {
    console.log(`[flow] emergency outbound ${caller} → ${dialed}`);
  } else {
    try {
      const [row] = await db.select().from(settings).limit(1);
      const s = loadSettings(row?.data);
      const policy = await checkExtensionOutbound(caller, dialed, s);
      if (!policy.ok) {
        console.log(`[flow] outbound blocked ${policy.reason} ${caller} → ${dialed}`);
        await cdrEnd(channelId, "FAILED");
        await ari.hangup(channelId);
        return;
      }
    } catch (e) {
      console.warn("[flow] policy check failed", (e as Error).message);
    }
  }

  // Stamp last dial for 12h return-caller (external only; not internal ext→ext)
  const rememberLastDial = async () => {
    try {
      await db.insert(lastDialAttempts).values({
        extensionNumber: caller || "unknown",
        number: dialed,
      });
    } catch {
      /* ignore */
    }
  };

  if (/^\d{3,4}$/.test(dialed) && !isEmergencyNumber(dialed)) {
    // Only a real extension, queue, ring group, or flow. Anything else matches
    // the _X. catch-all, which enters this app again and never plays audio.
    if (await isInternalDestination(dialed)) {
      await cdrAnswered(channelId);
      // Leave CDR open — ChannelDestroyed / dialplan curl finalizes billsec
      await ari.redirect(channelId, dialed, "from-internal");
      return;
    }
    console.log(`[flow] outbound ${caller} → ${dialed} (no such extension)`);
    await cdrEnd(channelId, "FAILED");
    await ari.playAndWait(channelId, "sound:ss-noservice", 4000).catch(() => undefined);
    await ari.hangup(channelId);
    return;
  }

  const route = await resolveOutboundDial(dialed);
  if (!route) {
    console.log(`[flow] outbound ${caller} → ${dialed} (no trunk)`);
    await rememberLastDial();
    await cdrEnd(channelId, "FAILED");
    await ari.hangup(channelId);
    return;
  }

  // Per-extension outbound CLI (visible number on PSTN)
  try {
    const [ext] = await db
      .select()
      .from(extensions)
      .where(eq(extensions.number, caller))
      .limit(1);
    if (ext?.outboundCli) {
      await ari.setChannelVar(channelId, "CALLERID(num)", ext.outboundCli);
      await ari.setChannelVar(channelId, "CALLERID(name)", ext.name || ext.outboundCli);
      console.log(`[flow] outbound CLI ${caller} → ${ext.outboundCli}`);
    }
  } catch (e) {
    console.warn("[flow] outbound CLI failed", (e as Error).message);
  }

  console.log(
    `[flow] outbound ${caller} → ${route.dialNumber}@${route.trunkEndpoint} (route=${route.routeId})`,
  );
  // Provider failover: monosip-trunk-dial retries these on CHANUNAVAIL / CONGESTION
  if (route.fallbackEndpoints?.length) {
    await ari.setChannelVar(channelId, "MONOSIP_TRUNK_FALLBACK", route.fallbackEndpoints.join("&"));
  }
  await rememberLastDial();
  // Dialplan: Dial(PJSIP/num@trunk) then /internal/cdr with real ANSWEREDTIME
  await cdrAnswered(channelId);
  await ari.redirect(channelId, `${route.trunkEndpoint}_${route.dialNumber}`, "monosip-trunk-dial");
}

export function attachFlowRuntime(): void {
  // Finalize CDR when channel truly dies (after dialplan Dial/redirect)
  ari.on("channelDestroyed", (channelId: string) => {
    void (async () => {
      try {
        const { cdrEnd, cdrIsOpen } = await import("../lib/cdr.js");
        if (cdrIsOpen(channelId)) await cdrEnd(channelId);
        // The wav is still being closed when the channel dies. Measure it after that.
        await sleep(1500);
        const { discardEmptyRecordingsForCall } = await import("../lib/recording-files.js");
        await discardEmptyRecordingsForCall(channelId);
      } catch {
        /* ignore */
      }
    })();
  });

  ari.on("stasisStart", (ev: {
    application: string;
    channel: { id: string; caller?: { number?: string } };
    args?: string[];
  }) => {
    setTimeout(() => {
      void (async () => {
        try {
          const channelId = ev.channel.id;
          const args = ev.args ?? [];
          const caller = ev.channel.caller?.number ?? "";

          if (ev.application === "monosip-flow" && args[0] === "bridge" && args[1]) {
            await ari.answer(channelId);
            const ok = await ari.addToBridge(args[1], channelId);
            console.log(`[flow] ${channelId} joined bridge ${args[1]} ok=${ok}`);
            return;
          }

          if (ev.application === "monosip-flow" && args[0] === "announce" && args[1]) {
            const { runAnnounceOnChannel } = await import("../lib/announce-call.js");
            await runAnnounceOnChannel(channelId, args[1]);
            return;
          }

          if (ev.application === "monosip-flow" && args[0] === "snoop-wait") {
            // Snoop channel parked in Stasis until bridge attach from chanspy()
            console.log(`[flow] snoop channel ready ${channelId}`);
            return;
          }

          // Transfer Dial failed → resume flow on noanswer/busy/chanunavail edge
          if (ev.application === "monosip-flow" && args[0] === "dial-failed") {
            const pending = pendingTransfers.get(channelId);
            pendingTransfers.delete(channelId);
            if (!pending) {
              console.warn(`[flow] ${channelId} dial-failed with no pending transfer`);
              await ari.hangup(channelId);
              return;
            }
            const status = args[1] ?? "NOANSWER";
            const edgeHandle = dialStatusToHandle(status);
            console.log(`[flow] ${channelId} dial-failed ${status} → edge ${edgeHandle}`);
            await ari.answer(channelId);
            const fromNode = pending.flow.nodes.find((n) => n.id === pending.nodeId);
            const nxt = fromNode ? dialExitNode(pending.flow, pending.nodeId, edgeHandle) : undefined;
            if (!nxt) {
              await ari.hangup(channelId);
              return;
            }
            await runFlowFromNode(channelId, pending.flow, nxt, pending.vars, pending.depth);
            return;
          }

          const vars: Record<string, string> = {
            caller,
            did: args[0] ?? "default",
            time: new Date().toISOString(),
          };

          void dispatchWebhooks("call.ringing", { channelId, ...vars });

          if (ev.application === "monosip-outbound") {
            await ari.answer(channelId);
            await handleOutbound(channelId, args[0] ?? "", caller);
            void dispatchWebhooks("call.ended", { channelId, direction: "outbound", ...vars });
            return;
          }

          if (ev.application === "monosip-inbound") {
            vars.did = args[0] ?? "default";
            if (args[1]) vars.caller = args[1];
            const callerNum = vars.caller || caller;
            const { cdrStart, cdrEnd } = await import("../lib/cdr.js");
            const { isAnonymousCaller, loadSettings } = await import("../lib/call-policy.js");

            void ari.subscribeChannel(ev.application, channelId);
            await cdrStart({
              callId: channelId,
              direction: "inbound",
              caller: callerNum,
              callee: vars.did,
              did: vars.did,
            });

            try {
              const [row] = await db.select().from(settings).limit(1);
              const s = loadSettings(row?.data);
              if (s.blockAnonymousInbound && isAnonymousCaller(callerNum)) {
                console.log(`[flow] inbound blocked anonymous`);
                await cdrEnd(channelId, "BUSY");
                await ari.hangup(channelId);
                return;
              }
            } catch {
              /* ignore */
            }

            // Return-to-caller: pending missed (12h) or last outbound dial within 12h
            const sinceMissed = new Date(Date.now() - 12 * 3600_000);
            const sinceDial = new Date(Date.now() - 12 * 3600_000);
            const pendingMissed = await db
              .select()
              .from(missedCalls)
              .where(
                and(
                  eq(missedCalls.number, callerNum),
                  eq(missedCalls.status, "pending"),
                  gte(missedCalls.at, sinceMissed),
                ),
              )
              .limit(1);
            const attempts = await db
              .select()
              .from(lastDialAttempts)
              .where(
                and(
                  eq(lastDialAttempts.number, callerNum),
                  gte(lastDialAttempts.at, sinceDial),
                ),
              )
              .limit(1);
            const targetExt =
              pendingMissed[0]?.target && /^\d{2,8}$/.test(pendingMissed[0].target)
                ? pendingMissed[0].target
                : attempts[0]?.extensionNumber;
            if (targetExt && !String(targetExt).startsWith("qcb:")) {
              console.log(`[flow] return-caller ${callerNum} → ${targetExt}`);
              // Only mark the matching pending row(s) for this extension — not qcb: callbacks
              await db
                .update(missedCalls)
                .set({ status: "returned" })
                .where(
                  and(
                    eq(missedCalls.number, callerNum),
                    eq(missedCalls.status, "pending"),
                    eq(missedCalls.target, targetExt),
                  ),
                );
              await ari.redirect(channelId, targetExt, "from-internal");
              // CDR stays open until hangup
              return;
            }

            const resolved = await resolveInbound(vars.did, callerNum);
            if (resolved.kind === "hangup") {
              try {
                await db.insert(missedCalls).values({
                  number: callerNum,
                  target: vars.did,
                  status: "pending",
                });
                void dispatchWebhooks("call.missed", {
                  channelId,
                  caller: callerNum,
                  did: vars.did,
                });
                void notifyMissedCall(callerNum, vars.did);
              } catch {
                /* ignore */
              }
            }
            await applyResolved(channelId, resolved, vars);
            // If redirected to dialplan/queue, billsec finalized on ChannelDestroyed / dialplan curl
            if (resolved.kind === "hangup") {
              await cdrEnd(channelId, "NOANSWER");
            }
            void dispatchWebhooks("call.ended", {
              channelId,
              direction: "inbound",
              ...vars,
            });
            return;
          }

          if (ev.application === "monosip-flow") {
            const key = args[0] ?? "main";
            const flow =
              key === "main" ? await loadPublishedFlow() : await loadPublishedFlow(key);
            if (!flow) {
              await ari.hangup(channelId);
              return;
            }
            const { cdrStart, cdrAnswered } = await import("../lib/cdr.js");
            let callee = "IVR";
            if (key !== "main") {
              try {
                const [f] = await db.select().from(flows).where(eq(flows.id, key)).limit(1);
                callee = f?.extensionNumber || f?.name || "IVR";
              } catch {
                callee = "IVR";
              }
            } else {
              callee = "Main IVR";
            }
            void ari.subscribeChannel(ev.application, channelId);
            await cdrStart({
              callId: channelId,
              direction: "internal",
              caller,
              callee,
              extensionNumber: caller || undefined,
            });
            try {
              await cdrAnswered(channelId);
              await runFlowOnChannel(channelId, flow, vars);
            } catch (e) {
              const { cdrEnd } = await import("../lib/cdr.js");
              await cdrEnd(channelId, "FAILED");
              throw e;
            }
            // If still open (IVR hung up in Stasis without redirect), ChannelDestroyed ends it
            void dispatchWebhooks("call.ended", { channelId, direction: "flow", ...vars });
            return;
          }

          await ari.hangup(channelId);
        } catch (e) {
          console.error("[flow] runtime error", e);
          try {
            const { cdrEnd } = await import("../lib/cdr.js");
            await cdrEnd(ev.channel.id, "FAILED");
          } catch {
            /* ignore */
          }
          try {
            await ari.hangup(ev.channel.id);
          } catch {
            /* ignore */
          }
        }
      })();
    }, 50);
  });
}
