import { execFile } from "node:child_process";
import { lookup as dnsLookup } from "node:dns/promises";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { SettingsSchema } from "@munasip/shared";
import {
  extensions,
  trunks,
  queues,
  queueMembers,
  ringGroups,
  ringGroupMembers,
  inboundRoutes,
  outboundRoutes,
  extensionForwarding,
  mohClasses,
  flows,
  settings,
  webWidgets,
} from "../db/schema.js";
import { decrypt, deriveSipPassword, encrypt } from "../lib/crypto.js";
import { resolveExtensionNumber } from "./routing.js";
import { listActiveWidgetSessions } from "../lib/widget-sessions.js";
import { queueLanguage, queueSoundLanguage } from "./queue-lang.js";

const execFileAsync = promisify(execFile);

/** Public IPv4 for RTP ICE candidates (vault EXTERNAL_IP or DNS of PUBLIC_HOST). */
async function resolveExternalIp(): Promise<string> {
  if (config.externalIp) return config.externalIp;
  const host = (config.publicHost || "").trim();
  if (!host || host === "localhost" || host === "127.0.0.1") return "";
  try {
    const r = await dnsLookup(host, { family: 4 });
    return r.address || "";
  } catch {
    return "";
  }
}

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true, mode: 0o755 });
}

/** Asterisk runuser must re-read includes after API writes (NineDeploy /data perms). */
async function ensureAsteriskCanReadConfig(dir: string): Promise<void> {
  // In-process chmod (not spawned `chmod`): the API runs with umask 0077, so
  // writeFile(mode 0o644) lands as 0o600 and the asterisk runuser cannot read the
  // includes — pbx_config/app_queue then DECLINE and every internal call 404s.
  // fs.chmod bypasses umask and, unlike a spawned binary, never times out under a
  // busy boot (embedded PG + Asterisk + TTS), so the files reliably end up readable.
  // Parent /data must be traversable (volume often 0700); the dirs stay 755, files 644.
  for (const d of [path.dirname(dir), dir]) {
    try {
      await chmod(d, 0o755);
    } catch {
      /* ignore */
    }
  }
  // Only the generated conf files — never chown -R the whole tree (sounds hang seed).
  const confFiles = [
    "pjsip_munasip.conf",
    "acl_munasip.conf",
    "queues_munasip.conf",
    "extensions_munasip.conf",
    "musiconhold_munasip.conf",
    "reload.flag",
  ];
  for (const name of confFiles) {
    try {
      await chmod(path.join(dir, name), 0o644);
    } catch {
      /* ignore */
    }
  }
}

/**
 * queues.conf joinempty/leavewhenempty. With an "empty" destination configured the
 * caller must not wait when no agent can take the call: unregistered (unavailable),
 * paused or invalid members all count as empty. Asterisk's `no` only covers
 * paused/invalid, so callers queued behind offline agents until maxWait.
 * Busy (in-use) agents still count as present — callers wait for them.
 */
export function queueEmptyRules(hasEmptyDest: boolean): { joinempty: string; leavewhenempty: string } {
  if (!hasEmptyDest) return { joinempty: "yes", leavewhenempty: "no" };
  const when = "penalty,paused,invalid,unavailable";
  return { joinempty: when, leavewhenempty: when };
}

/**
 * Run `fn` one at a time. Calls made while it runs share ONE follow-up run, which
 * starts after the current one and therefore sees every change made meanwhile.
 */
export function singleFlight(fn: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let queued: Promise<void> | null = null;
  const start = (): Promise<void> => {
    running = fn().finally(() => {
      running = null;
    });
    return running;
  };
  return () => {
    if (!running) return start();
    if (!queued) {
      queued = running
        .catch(() => undefined)
        .then(() => {
          queued = null;
          return start();
        });
    }
    return queued;
  };
}

/**
 * Immediate CLI reload. Must never overlap another reload: concurrent
 * `module reload res_pjsip.so` runs deadlock Asterisk's module loader — the CLI
 * hangs and SIP over WebSocket goes silent (softphones stuck on "Connecting").
 * Only called from the single-flight writeAsteriskConfig. Returns false when the
 * Asterisk CLI is unreachable (Compose sidecar) so the reload.flag watcher takes over.
 */
/**
 * Domain Asterisk puts in From/Contact of requests to softphones. Without it Asterisk
 * uses the container hostname — Docker names are random hex, and RFC 3261 requires the
 * top label to start with a letter: on a "20579c14dcc0" container SIP.js drops every
 * request ("error parsing header 'From'"), so qualify fails, the contact goes
 * Unreachable, calls to the extension 404 and the IVR treats operators as offline.
 * It worked or broke per deploy depending on the random name.
 */
/** From-header identity for a provider. A caller ID number replaces the SIP login. */
export function trunkCallerLines(trunk: {
  username?: string | null;
  callerId?: string | null;
}): string[] {
  const cli = trunk.callerId?.trim();
  if (cli) return [`from_user=${cli}`, `callerid=${cli}`];
  return trunk.username ? [`from_user=${trunk.username}`] : [];
}

export function sipFromDomain(host: string): string {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  const ipv4 = /^\d{1,3}(\.\d{1,3}){3}$/;
  const label = "[a-z0-9]([a-z0-9-]*[a-z0-9])?";
  const hostname = new RegExp(`^(${label}\\.)*[a-z]([a-z0-9-]*[a-z0-9])?$`);
  return ipv4.test(h) || hostname.test(h) ? h : "localhost";
}

/** Which generated config files changed in this write. */
export type ConfigChanges = {
  pjsip: boolean;
  acl: boolean;
  queues: boolean;
  extensions: boolean;
  moh: boolean;
};

/**
 * Asterisk CLI reload commands for the files that changed.
 *
 * Never `module reload acl` together with `module reload res_pjsip.so`: an ACL
 * reload makes res_pjsip reload its whole config asynchronously, and an explicit
 * res_pjsip reload overlapping it never finishes ("The previous reload command
 * didn't finish yet" forever) — SIP over WebSocket then goes silent. When the ACL
 * changed, its own res_pjsip reload covers pjsip_munasip.conf too.
 *
 * `module load` (first run after boot only) revives modules that DECLINED at cold
 * start because their config was briefly unreadable; `load` on a running module is
 * a no-op, `reload` alone cannot revive a declined one.
 */
export function reloadPlan(changes: ConfigChanges, firstRun: boolean): string[] {
  const cmds: string[] = [];
  if (firstRun) cmds.push("module load res_pjsip.so", "module load app_queue.so", "module load pbx_config.so");
  if (changes.acl) cmds.push("module reload acl");
  else if (changes.pjsip) cmds.push("module reload res_pjsip.so");
  if (changes.queues) cmds.push("module reload app_queue.so");
  if (changes.moh) cmds.push("module reload res_musiconhold.so");
  if (changes.extensions) cmds.push("module reload pbx_config.so");
  return cmds;
}

/** Shell for one locked reload run (exported for tests). */
export function reloadScript(cmds: string[]): string {
  return [
    // Never reload a booting Asterisk (module reload during startup deadlocks the loader).
    "asterisk -rx 'core waitfullybooted' >/dev/null 2>&1 || exit 0",
    "echo ok",
    // A reload refused because another is still running is retried, not dropped.
    `rl() { i=0; while [ $i -lt 30 ]; do out=$(asterisk -rx "$1" 2>&1); case "$out" in *"didn't finish yet"*|*"already in progress"*) i=$((i+1)); sleep 1;; *) return 0;; esac; done; }`,
    ...cmds.map((c) =>
      c === "module reload acl"
        ? // let the ACL-triggered async res_pjsip reload finish inside the lock
          `rl '${c}'; sleep 5`
        : `rl '${c}'`,
    ),
  ].join("\n");
}

let firstReload = true;

/**
 * Reload Asterisk over the CLI for the changed files. Runs only from the
 * single-flight writeAsteriskConfig and under the same flock as the reload.flag
 * watcher, so reloads never overlap. Returns false when the CLI is unreachable
 * (Compose sidecar) so the caller falls back to reload.flag.
 */
export async function reloadAsteriskCli(changes: ConfigChanges): Promise<boolean> {
  const cmds = reloadPlan(changes, firstReload);
  const lock = path.join(config.asterisk.configDir, "reload.lock");
  try {
    const { stdout } = await execFileAsync("flock", ["-w", "60", lock, "sh", "-c", reloadScript(cmds)], {
      timeout: 120_000,
    });
    if (stdout.includes("ok")) firstReload = false;
    return stdout.includes("ok");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") return false;
  }
  // No flock (dev host): plain sequence — still serialized by singleFlight.
  let reachable = false;
  for (const c of cmds) {
    try {
      await execFileAsync("asterisk", ["-rx", c], { timeout: 5000 });
      reachable = true;
    } catch {
      /* unreachable CLI → caller writes reload.flag for the watcher */
    }
  }
  if (reachable) firstReload = false;
  return reachable;
}

/** Dialplan Playback() path for KVKK (sound under Asterisk sounds/). */
function kvkkPlaybackLine(kvkkPromptId: string | null | undefined): string {
  if (kvkkPromptId) {
    const safe = kvkkPromptId.replace(/[^\w.-]/g, "");
    if (safe) return ` same => n,Playback(munasip/${safe})`;
  }
  // Fallback: short silence+beep when no prompt configured
  return ` same => n,Playback(beep)`;
}

/**
 * Dialplan → API hook, sent in-process with func_curl (no fork). System(curl) forked a
 * shell per call; the SIGCHLD interrupted Asterisk's poll() loops ("WebSocket poll
 * error: Interrupted system call"), dropping ARI and SIP WebSockets and killing threads
 * — softphones then stuck on "Connecting" after the first call. CURL() splits its
 * arguments on commas, so the JSON is URIENCODE()d (evaluated first) into a form field;
 * the API's form parser turns it back into the JSON body (see internal-form.ts).
 * Nested () inside the JSON (CALLERID/CHANNEL/IF) must still be Set() onto flat vars first.
 */
export function internalPost(apiPath: string, jsonBody: string): string {
  const url = `${config.internalApiUrl}/api/v1/internal/${apiPath}`;
  return `Set(MUNASIP_HOOK=\${CURL(${url},secret=${config.internalApiSecret}&payload=\${URIENCODE(${jsonBody})})})`;
}

/** Prep flat channel vars for CDR / recording JSON (no nested () in System()). */
/**
 * After Queue(): agent extension, hold time (QEHOLDTIME) and talk time measured from
 * queue entry (MUNASIP_QSTART) — the channel was answered long before for MOH/announces.
 */
function queueOutcomeLines(label: string): string[] {
  return [
    ` same => n,Set(MUNASIP_AGENT=\${CUT(MEMBERINTERFACE,/,2)})`,
    ` same => n,Set(MUNASIP_QWAIT=)`,
    ` same => n,GotoIf($["\${MUNASIP_AGENT}" = "" | "\${MUNASIP_QSTART}" = ""]?${label})`,
    ` same => n,Set(MUNASIP_QWAIT=\${QEHOLDTIME})`,
    ` same => n,Set(MUNASIP_BILL=$[\${EPOCH} - \${MUNASIP_QSTART} - \${QEHOLDTIME}])`,
    ` same => n(${label}),NoOp(Queue outcome agent=\${MUNASIP_AGENT} wait=\${MUNASIP_QWAIT})`,
  ];
}

function qosPrepLines(opts?: { dialedTime?: boolean; cdrDuration?: boolean }): string[] {
  const lines = [
    ` same => n,Set(MUNASIP_CID=\${CALLERID(num)})`,
    ` same => n,Set(MUNASIP_BILL=\${IF($["\${ANSWEREDTIME}"=""]?0:\${ANSWEREDTIME})})`,
    ` same => n,Set(MUNASIP_MOS=\${CHANNEL(rtpqos,audio,local,mos)})`,
    ` same => n,Set(MUNASIP_JIT=\${CHANNEL(rtpqos,audio,local,jitter)})`,
    ` same => n,Set(MUNASIP_LOSS=\${CHANNEL(rtpqos,audio,local,lost)})`,
  ];
  if (opts?.dialedTime !== false) {
    lines.splice(
      2,
      0,
      ` same => n,Set(MUNASIP_DUR=\${IF($["\${DIALEDTIME}"=""]?0:\${DIALEDTIME})})`,
    );
  }
  if (opts?.cdrDuration) {
    lines.push(
      ` same => n,Set(MUNASIP_CDRDUR=\${IF($["\${CDR(duration)}"=""]?0:\${CDR(duration)})})`,
    );
  }
  return lines;
}

/**
 * Write all generated config and reload Asterisk. Serialized and coalesced: a burst
 * of changes (DND toggles, admin saves, bans) becomes one write + one reload.
 */
export const writeAsteriskConfig = singleFlight(writeAsteriskConfigNow);

async function writeAsteriskConfigNow(): Promise<void> {
  const dir = config.asterisk.configDir;
  await ensureDir(dir);

  const exts = await db.select().from(extensions);
  const trks = await db.select().from(trunks).where(eq(trunks.enabled, true));
  const qs = await db.select().from(queues);
  const qMembers = await db.select().from(queueMembers);
  const rgs = await db.select().from(ringGroups);
  const rgMembers = await db.select().from(ringGroupMembers);
  const inbound = await db.select().from(inboundRoutes);
  const outbound = await db.select().from(outboundRoutes);
  const fwdRules = await db.select().from(extensionForwarding);
  const moh = await db.select().from(mohClasses);
  const flowRows = await db.select().from(flows);

  let kvkkPromptId: string | null = null;
  let kvkkEnabled = true;
  try {
    const [srow] = await db.select().from(settings).limit(1);
    const s = SettingsSchema.parse(srow?.data ?? {});
    kvkkEnabled = s.kvkkAnnouncementEnabled !== false;
    kvkkPromptId = s.kvkkPromptId ?? null;
  } catch {
    /* defaults */
  }

  const externalIp = await resolveExternalIp();
  if (externalIp && !config.externalIp) {
    console.warn(`[config] EXTERNAL_IP unset — using ${externalIp} from PUBLIC_HOST`);
  }
  // VPS / real phones: rewrite Contact to the observed source (NAT).
  // Local Docker Desktop (Mac): keep advertised Contact when EXTERNAL_IP is unset.
  const rewriteContact = externalIp ? "yes" : "no";

  const transportUdp = [
    "[transport-udp]",
    "type=transport",
    "protocol=udp",
    "bind=0.0.0.0:5060",
  ];
  const transportWs = [
    "[transport-ws]",
    "type=transport",
    "protocol=ws",
    "bind=0.0.0.0",
  ];
  // Browser softphone Via is WSS (TLS at edge); Asterisk still needs a wss transport object.
  const transportWss = [
    "[transport-wss]",
    "type=transport",
    "protocol=wss",
    "bind=0.0.0.0",
  ];
  // Desk-phone SIP over TLS (cert from entrypoint asterisk.pem)
  const transportTls = [
    "[transport-tls]",
    "type=transport",
    "protocol=tls",
    "bind=0.0.0.0:5061",
    "cert_file=/etc/asterisk/keys/asterisk.pem",
    "priv_key_file=/etc/asterisk/keys/asterisk.pem",
    "method=tlsv1_2",
  ];
  if (externalIp) {
    for (const block of [transportUdp, transportWs, transportWss, transportTls]) {
      block.push(`external_media_address=${externalIp}`);
      block.push(`external_signaling_address=${externalIp}`);
    }
    for (const net of config.localNets) {
      transportUdp.push(`local_net=${net}`);
      transportWs.push(`local_net=${net}`);
      transportWss.push(`local_net=${net}`);
      transportTls.push(`local_net=${net}`);
    }
  }

  // SIP IP ACL → acl.conf named ACL (pjsip type=acl is ignored; undefined ACL rejects all)
  let sipAclName: string | null = null;
  const namedAclConf: string[] = ["; Auto-generated by MunaSIP — do not edit", ""];
  try {
    const { loadSecuritySettings } = await import("../lib/security-settings.js");
    const sec = await loadSecuritySettings();
    // WSS softphone arrives via Fastify proxy → Asterisk sees 127.0.0.1
    const loopback = ["127.0.0.1", "127.0.0.1/32", "::1"];
    const allow = [
      ...new Set([
        ...(sec.sipIpAllowlist ?? []).map((s) => s.trim()).filter(Boolean),
        ...config.localNets,
        ...loopback,
        ...trks.map((t) => t.host).filter(Boolean),
      ]),
    ];
    const deny = (sec.sipIpDenylist ?? []).map((s) => s.trim()).filter(Boolean);
    // Panel / fail2ban / login bans → SIP deny
    let banDeny: string[] = [];
    try {
      const { listActiveIpBans } = await import("../lib/ip-bans.js");
      // sip-guard entries stay out of the ACL: changing it reloads res_pjsip,
      // which hangs under a scanner flood (see lib/sip-guard.ts)
      banDeny = (await listActiveIpBans(500))
        .filter((b) => b.source !== "sip-guard")
        .map((b) => b.ip)
        .filter(Boolean);
    } catch {
      /* ignore */
    }
    const loopbackDeny = new Set(["127.0.0.1", "127.0.0.1/32", "::1", "::1/128"]);
    const allDeny = [...new Set([...deny, ...banDeny])].filter((d) => !loopbackDeny.has(d));
    const hasAllowlist = (sec.sipIpAllowlist ?? []).some((s) => s.trim());
    if (hasAllowlist || allDeny.length > 0) {
      sipAclName = "munasip_sip_acl";
      // Asterisk named ACL: last matching rule wins
      namedAclConf.push(`[${sipAclName}]`);
      if (hasAllowlist) {
        namedAclConf.push("deny=0.0.0.0/0");
        for (const a of allow) namedAclConf.push(`permit=${a}`);
      }
      for (const d of allDeny) namedAclConf.push(`deny=${d}`);
      namedAclConf.push("");
    }
  } catch (e) {
    console.warn("[config] SIP ACL skipped:", (e as Error).message);
  }

  const pjsip: string[] = [
    "; Auto-generated by MunaSIP — do not edit",
    "",
    ...transportUdp,
    "",
    ...transportWs,
    "",
    ...transportWss,
    "",
    ...transportTls,
    "",
  ];

  for (const ext of exts) {
    let secret: string;
    try {
      secret = decrypt(ext.sipSecretEnc);
    } catch {
      // Stale ciphertext (ENCRYPTION_KEY rotated) — re-key so softphone + PJSIP stay in sync
      secret = deriveSipPassword();
      try {
        await db
          .update(extensions)
          .set({ sipSecretEnc: encrypt(secret), updatedAt: new Date() })
          .where(eq(extensions.id, ext.id));
        console.warn(`[config] re-keyed SIP secret for extension ${ext.number}`);
      } catch (e) {
        console.warn(`[config] re-key failed for ${ext.number}:`, (e as Error).message);
        secret = "changeme";
      }
    }
    // Object names MUST match the SIP user (extension number) so REGISTER finds the AOR
    const id = ext.number;
    pjsip.push(
      `[${id}]`,
      "type=endpoint",
      `from_domain=${sipFromDomain(config.publicHost)}`,
      "context=from-internal",
      "disallow=all",
      // Prefer PCM/G.722 — image has no codec_opus.so, so Opus breaks file playback (IVR/TTS)
      "allow=ulaw,alaw,g722",
      `auth=${id}`,
      `aors=${id}`,
      "direct_media=no",
      "rtp_symmetric=yes",
      "force_rport=yes",
      `rewrite_contact=${rewriteContact}`,
      "dtmf_mode=auto",
      // Softphone is WebRTC (DTLS-SRTP). Do NOT set media_encryption=sdes here —
      // that overrides webrtc=yes and browsers stay silent (no DTLS media).
      "webrtc=yes",
      "dtls_auto_generate_cert=yes",
      "media_encryption=dtls",
      "media_use_received_transport=yes",
      "rtp_timeout=60",
      "rtp_timeout_hold=300",
      // Do not set transport= here: PJSIP accepts a single transport name only.
      // Omitting it lets each contact use the transport it registered on (UDP / WS / TLS).
      ...(sipAclName ? [`acl=${sipAclName}`] : []),
      "",
      `[${id}]`,
      "type=auth",
      "auth_type=userpass",
      `username=${id}`,
      `password=${secret}`,
      "",
      `[${id}]`,
      "type=aor",
      // Desk phone + softphone both register (do not kick prior contacts)
      "max_contacts=3",
      "remove_existing=no",
      // Cap binding lifetime so dead test UAs age out without waiting hours.
      "default_expiration=300",
      "maximum_expiration=300",
      // Qualify marks ghosts Unavail (Dial skips them); remove_unavailable only
      // frees AOR slots when a new REGISTER would exceed max_contacts.
      "qualify_frequency=30",
      "qualify_timeout=3.0",
      "remove_unavailable=yes",
      "",
    );
  }

  // Website widget guest WebRTC endpoints (short-lived; context=from-widget)
  try {
    const guests = await listActiveWidgetSessions();
    for (const g of guests) {
      if (!g.password) continue;
      const id = g.sipUser;
      pjsip.push(
        `[${id}]`,
        "type=endpoint",
        `from_domain=${sipFromDomain(config.publicHost)}`,
        "context=from-widget",
        "disallow=all",
        "allow=ulaw,alaw,g722",
        `auth=${id}`,
        `aors=${id}`,
        "direct_media=no",
        "rtp_symmetric=yes",
        "force_rport=yes",
        `rewrite_contact=${rewriteContact}`,
        "dtmf_mode=rfc4733",
        "webrtc=yes",
        "dtls_auto_generate_cert=yes",
        "media_encryption=dtls",
        "media_use_received_transport=yes",
        "rtp_timeout=60",
        `set_var=MUNASIP_WIDGET_NUM=${g.widgetNumber}`,
        `set_var=MUNASIP_WIDGET_MAX=${g.maxCallSeconds}`,
        g.callerName ? `callerid="${g.callerName.replace(/"/g, "")}" <${id}>` : `callerid=Web <${id}>`,
        "",
        `[${id}]`,
        "type=auth",
        "auth_type=userpass",
        `username=${id}`,
        `password=${g.password}`,
        "",
        `[${id}]`,
        "type=aor",
        "max_contacts=1",
        "remove_existing=yes",
        "default_expiration=300",
        "maximum_expiration=300",
        "",
      );
    }
  } catch (e) {
    console.warn("[config] widget guests skipped:", (e as Error).message);
  }

  for (const trunk of trks) {
    const id = `trunk_${trunk.id.slice(0, 8)}`;
    let secret = "";
    if (trunk.secretEnc) {
      try {
        secret = decrypt(trunk.secretEnc);
      } catch {
        /* empty */
      }
    }
    const codecs = ((trunk.codecs as string[]) ?? ["ulaw", "alaw"]).filter(Boolean);
    const tport =
      trunk.transport === "tls"
        ? "transport-tls"
        : trunk.transport === "tcp"
          ? "transport-udp"
          : "transport-udp";
    const userpass = trunk.authType !== "ip";
    const fromDomain = (trunk.fromDomain?.trim() || trunk.host).replace(/^sip:/i, "");
    const proxy = trunk.outboundProxy?.trim() || "";
    const contactUri = proxy
      ? `sip:${proxy.includes(":") ? proxy : `${proxy}:${trunk.port}`}`
      : `sip:${trunk.host}:${trunk.port}`;
    const doRegister = userpass && trunk.register !== false && Boolean(trunk.username);

    pjsip.push(
      `[${id}]`,
      "type=endpoint",
      "context=from-trunk",
      "disallow=all",
      `allow=${codecs.join(",") || "ulaw,alaw"}`,
      ...(userpass ? [`outbound_auth=${id}`] : []),
      `aors=${id}`,
      `transport=${tport}`,
      `from_domain=${fromDomain}`,
      ...trunkCallerLines(trunk),
      "direct_media=no",
      `device_state_busy_at=${Math.max(1, trunk.maxChannels ?? 10)}`,
      "",
    );
    if (userpass) {
      pjsip.push(
        `[${id}]`,
        "type=auth",
        "auth_type=userpass",
        `username=${trunk.username ?? ""}`,
        `password=${secret}`,
        "",
      );
    }
    pjsip.push(
      `[${id}]`,
      "type=aor",
      `contact=${contactUri}`,
      "qualify_frequency=60",
      "",
      `[${id}]`,
      "type=identify",
      `endpoint=${id}`,
      `match=${trunk.host}`,
      "",
    );
    if (doRegister) {
      pjsip.push(
        `[${id}]`,
        "type=registration",
        `outbound_auth=${id}`,
        `server_uri=sip:${trunk.host}:${trunk.port}`,
        `client_uri=sip:${trunk.username}@${fromDomain}`,
        `retry_interval=60`,
        "",
      );
    }
  }

  const resolveQueueDest = (
    destType: string | null | undefined,
    destId: string | null | undefined,
  ): string | null => {
    if (!destType || destType === "hangup") return "Hangup()";
    if (destType === "extension" && destId) {
      const e = exts.find((x) => x.id === destId || x.number === destId);
      return e ? `Goto(from-internal,${e.number},1)` : `Goto(from-internal,${destId},1)`;
    }
    if (destType === "queue" && destId) {
      const qq = qs.find((x) => x.id === destId || x.number === destId);
      return qq ? `Goto(from-internal,${qq.number},1)` : null;
    }
    if (destType === "ring_group" && destId) {
      const rg = rgs.find((x) => x.id === destId || x.number === destId);
      return rg ? `Goto(from-internal,${rg.number},1)` : null;
    }
    if (destType === "voicemail" && destId) {
      const e = exts.find((x) => x.id === destId || x.number === destId);
      const num = e?.number ?? destId;
      return `Goto(from-internal,*${num},1)`;
    }
    if (destType === "flow" && destId) {
      return `Stasis(munasip-flow,${destId})`;
    }
    return "Hangup()";
  };

  const queuesConf: string[] = ["; Auto-generated by MunaSIP", ""];
  for (const q of qs) {
    const empty = queueEmptyRules(Boolean(q.joinemptyDestType));
    const mohClass = moh.find((m) => m.id === q.mohId)?.name ?? "default";
    queuesConf.push(
      `[${q.number}]`,
      `strategy=${q.strategy}`,
      `timeout=${q.memberTimeout}`,
      `retry=2`,
      `wrapuptime=${q.wrapup}`,
      `maxlen=${q.maxCallers}`,
      `joinempty=${empty.joinempty}`,
      `leavewhenempty=${empty.leavewhenempty}`,
      "ringinuse=no",
      // QEHOLDTIME / MEMBERINTERFACE after a member answers → CDR wait_sec + agent
      "setqueueentryvar=yes",
      "setinterfacevar=yes",
      `musicclass=${mohClass}`,
      // Periodic in-queue: Asterisk ducks MOH, plays position + holdtime, resumes MOH
      // First announce is a single cached TTS sentence (Playback qpos/N) after MOH starts.
      q.announcePosition ? "announce-position=yes" : "announce-position=no",
      q.announceHoldtime ? "announce-holdtime=yes" : "announce-holdtime=no",
      q.announcePosition || q.announceHoldtime ? "announce-frequency=30" : "announce-frequency=0",
      "min-announce-frequency=15",
      // First join: MOH starts immediately; we play entry TTS ourselves (not Asterisk's first announce)
      "announce-to-first-user=no",
      "relative-periodic-announce=yes",
      "",
    );
    const members = qMembers.filter((m) => m.queueId === q.id && !m.paused);
    for (const m of members) {
      const ext = exts.find((e) => e.id === m.extensionId);
      if (!ext || ext.dnd) continue;
      queuesConf.push(`member => PJSIP/${ext.number},${m.penalty}`);
    }
    queuesConf.push("");
  }

  const extensionsConf: string[] = [
    "; Auto-generated by MunaSIP",
    "",
    "[from-internal]",
    // Set() first + single-quoted JSON: System() shell otherwise mangles \" escapes
    // and nested CALLERID(num) parens are safer outside the curl -d string.
    "exten => *78,1,NoOp(DND on)",
    " same => n,Set(MUNASIP_DND_EXT=${CALLERID(num)})",
    ` same => n,${internalPost("dnd", '{"extension":"\${MUNASIP_DND_EXT}","dnd":true}')}`,
    " same => n,Playback(beep)",
    " same => n,Hangup()",
    "exten => *79,1,NoOp(DND off)",
    " same => n,Set(MUNASIP_DND_EXT=${CALLERID(num)})",
    ` same => n,${internalPost("dnd", '{"extension":"\${MUNASIP_DND_EXT}","dnd":false}')}`,
    " same => n,Playback(beep)",
    " same => n,Hangup()",
    "exten => *8,1,Pickup()",
    " same => n,Hangup()",
    "exten => 700,1,Park()",
    " same => n,Hangup()",
    "",
  ];

  // Softphone / lab: dial flow extensionNumber → published (or draft) IVR
  for (const f of flowRows) {
    const num = (f.extensionNumber ?? "").trim();
    if (!/^\d{2,8}$/.test(num)) continue;
    extensionsConf.push(
      `exten => ${num},1,NoOp(Flow ${f.name})`,
      ` same => n,Stasis(munasip-flow,${f.id})`,
      ` same => n,Hangup()`,
      "",
    );
  }

  for (const ext of exts) {
    // Boss–secretary: ring secretary first when dialing the boss
    const secs = exts.filter((e) => e.bossSecretaryOf === ext.id && !e.dnd);
    const alwaysFwd = fwdRules.find(
      (f) => f.extensionId === ext.id && f.condition === "always",
    );
    let dialTarget = `PJSIP/${ext.number}`;
    let ringSec = 20;
    let alwaysExternal: string | null = null;
    if (secs[0]) {
      dialTarget = `PJSIP/${secs[0].number}`;
    } else if (alwaysFwd?.destType === "extension" && alwaysFwd.destId) {
      const fwdNum = resolveExtensionNumber(alwaysFwd.destId, exts) ?? alwaysFwd.destId;
      dialTarget = `PJSIP/${fwdNum}`;
      ringSec = alwaysFwd.ringSeconds;
    } else if (
      alwaysFwd?.destType === "external" &&
      alwaysFwd.destId &&
      ext.mobileForwardAllowed
    ) {
      alwaysExternal = alwaysFwd.destId;
      ringSec = alwaysFwd.ringSeconds;
    }
    const noans = fwdRules.find(
      (f) => f.extensionId === ext.id && f.condition === "noanswer",
    );
    if (noans) ringSec = noans.ringSeconds;

    // MixMonitor into shared recordings volume; register in DB on hangup via internal API
    const recFile = `/var/spool/asterisk/recording/\${UNIQUEID}-${ext.number}.wav`;
    const recRegister = internalPost(
      "recording",
      `{"callId":"\${UNIQUEID}","file":"/data/recordings/\${UNIQUEID}-${ext.number}.wav","extension":"${ext.number}","duration":\${MUNASIP_BILL}}`,
    );
    // on_demand: no auto MixMonitor (feature code / future); always|external record
    const wantRec = ext.recordingMode === "always" || ext.recordingMode === "external";
    const kvkkLines =
      wantRec && kvkkEnabled
        ? [
            ` same => n,GotoIf($["\${KVKK_DONE}" = "1"]?kvkkdone)`,
            ` same => n,Set(__KVKK_DONE=1)`,
            kvkkPlaybackLine(kvkkPromptId),
            ` same => n(kvkkdone),NoOp(KVKK)`,
          ]
        : [];
    const rec = wantRec
      ? [
          ` same => n,Set(MUNASIP_RECFILE=/data/recordings/\${UNIQUEID}-${ext.number}.wav)`,
          ` same => n,MixMonitor(${recFile})`,
        ]
      : [];

    extensionsConf.push(
      `exten => ${ext.number},hint,PJSIP/${ext.number}`,
      `exten => ${ext.number},1,NoOp(Dial ${ext.number})`,
      // DND → treat as BUSY (honor busy/noanswer forwarding)
      ` same => n,GotoIf($["\${DB(DND/${ext.number})}" = "1"]?dndbusy)`,
    );
    extensionsConf.push(...kvkkLines);
    extensionsConf.push(...rec);
    if (alwaysExternal) {
      extensionsConf.push(
        ` same => n,Stasis(munasip-outbound,${alwaysExternal})`,
        ` same => n,Hangup()`,
        ` same => n(dndbusy),Goto(s-BUSY-${ext.number},1)`,
        "",
      );
    } else {
      const cdrPost = internalPost(
        "cdr",
        `{"callId":"\${UNIQUEID}","caller":"\${MUNASIP_CID}","callee":"\${MUNASIP_CALLEE}","disposition":"\${DIALSTATUS}","billsec":\${MUNASIP_BILL},"duration":\${MUNASIP_DUR},"wait":"\${MUNASIP_WAIT}","direction":"internal","mos":"\${MUNASIP_MOS}","jitter":"\${MUNASIP_JIT}","packetLoss":"\${MUNASIP_LOSS}"}`,
      );
      extensionsConf.push(
        // Distinctive ring: short caller = internal, longer = external (desk phones use Alert-Info).
        // Escape ';' — bare ';' starts an Asterisk dialplan comment and truncates the Set().
        ` same => n,Set(MUNASIP_CALLEE=${ext.number})`,
        ` same => n,GotoIf($[\${LEN(\${CALLERID(num)})} > 5]?alerte)`,
        ` same => n,Set(PJSIP_HEADER(add,Alert-Info)=<http://127.0.0.1>\\;info=internal)`,
        ` same => n,Goto(dodial)`,
        ` same => n(alerte),Set(PJSIP_HEADER(add,Alert-Info)=<http://127.0.0.1>\\;info=external)`,
        ` same => n(dodial),Dial(${dialTarget},${ringSec},tT)`,
        ...qosPrepLines(),
        // Ring time before answer (DIALEDTIME includes talk time)
        ` same => n,Set(MUNASIP_WAIT=\${IF($["\${DIALSTATUS}" = "ANSWER"]?$[\${MUNASIP_DUR} - \${MUNASIP_BILL}]:)})`,
        ...(rec.length
          ? [
              ` same => n,StopMixMonitor()`,
              ` same => n,${recRegister}`,
              ` same => n,Set(MUNASIP_REC_DONE=1)`,
            ]
          : []),
        ` same => n,${cdrPost}`,
        ` same => n,Set(MUNASIP_CDR_DONE=1)`,
        // ANSWER: hang up cleanly. Failures jump to per-status forward/missed handlers.
        ` same => n,GotoIf($["\${DIALSTATUS}" != "ANSWER"]?fwd)`,
        ` same => n,Hangup()`,
        ` same => n(fwd),Goto(s-\${DIALSTATUS}-${ext.number},1)`,
        ` same => n(dndbusy),Goto(s-BUSY-${ext.number},1)`,
        "",
      );
    }

    const missedCurl = [
      ` same => n,Set(MUNASIP_CID=\${CALLERID(num)})`,
      ` same => n,${internalPost("missed", `{"caller":"\${MUNASIP_CID}","target":"${ext.number}"}`)}`,
    ];

    // Per-extension dialstatus forwarding
    for (const st of ["NOANSWER", "BUSY", "CHANUNAVAIL"] as const) {
      const cond =
        st === "NOANSWER" ? "noanswer" : st === "BUSY" ? "busy" : "chanunavail";
      const rule = fwdRules.find((f) => f.extensionId === ext.id && f.condition === cond);
      if (rule?.destType === "extension" && rule.destId) {
        const destNum = resolveExtensionNumber(rule.destId, exts) ?? rule.destId;
        // Max 5 hops + never visit same extension twice
        extensionsConf.push(
          `exten => s-${st}-${ext.number},1,Set(__FWDDEPTH=$[$\{IF($["$\{FWDDEPTH}"=""]?0:$\{FWDDEPTH})}+1])`,
          ` same => n,GotoIf($[\${FWDDEPTH} > 5]?fwdexceed)`,
          ` same => n,GotoIf($[",\${IF($["\${FWD_VISITED}"=""]?${ext.number}:\${FWD_VISITED})}," : ",${destNum},"]?fwdvisited)`,
          ` same => n,Set(__FWD_VISITED=\${IF($["\${FWD_VISITED}"=""]?${ext.number},${destNum}:\${FWD_VISITED},${destNum})})`,
          ` same => n,Goto(${destNum},1)`,
          ` same => n(fwdexceed),NoOp(Forward depth exceeded)`,
          ` same => n,Hangup()`,
          ` same => n(fwdvisited),NoOp(Forward already visited ${destNum})`,
          ` same => n,Hangup()`,
          "",
        );
      } else if (rule?.destType === "voicemail") {
        extensionsConf.push(
          `exten => s-${st}-${ext.number},1,Goto(*${ext.number},1)`,
          "",
        );
      } else if (
        rule?.destType === "external" &&
        rule.destId &&
        ext.mobileForwardAllowed
      ) {
        extensionsConf.push(
          `exten => s-${st}-${ext.number},1,Stasis(munasip-outbound,${rule.destId})`,
          ` same => n,Hangup()`,
          "",
        );
      } else if (rule?.destType === "queue" && rule.destId) {
        const q = qs.find((x) => x.id === rule.destId || x.number === rule.destId);
        extensionsConf.push(
          `exten => s-${st}-${ext.number},1,Goto(${q?.number ?? rule.destId},1)`,
          "",
        );
      } else {
        const lines = [`exten => s-${st}-${ext.number},1,NoOp(${st} ${ext.number})`];
        if (st === "NOANSWER") lines.push(...missedCurl);
        lines.push(` same => n,Hangup()`, "");
        extensionsConf.push(...lines);
      }
    }
  }

  extensionsConf.push(
    "exten => s-NOANSWER,1,Hangup()",
    "exten => s-BUSY,1,Hangup()",
    "exten => s-CHANUNAVAIL,1,Hangup()",
    "exten => s-CONGESTION,1,Hangup()",
    "exten => s-CANCEL,1,Hangup()",
    "",
    // Caller BYE during Dial aborts the dialplan — catch CDR here once.
    "exten => h,1,NoOp(Hangup handler CDR)",
    ` same => n,GotoIf($["\${MUNASIP_CDR_DONE}" = "1"]?cdrdone)`,
    ` same => n,GotoIf($["\${MUNASIP_QUEUE}" != ""]?hqueue)`,
    ` same => n,GotoIf($["\${MUNASIP_CALLEE}" = ""]?cdrdone)`,
    ...qosPrepLines(),
    // Caller BYE aborts the lines after Dial(), so the MixMonitor file never reached the panel.
    ` same => n,GotoIf($["\${MUNASIP_REC_DONE}" = "1" | "\${MUNASIP_RECFILE}" = ""]?reccdr)`,
    ` same => n,StopMixMonitor()`,
    ` same => n,${internalPost(
      "recording",
      `{"callId":"\${UNIQUEID}","file":"\${MUNASIP_RECFILE}","duration":\${MUNASIP_BILL}}`,
    )}`,
    ` same => n,Set(MUNASIP_REC_DONE=1)`,
    ` same => n(reccdr),NoOp(Recording)`,
    ` same => n,Set(MUNASIP_WAIT=\${IF($["\${DIALSTATUS}" = "ANSWER" | "\${DIALSTATUS}" = ""]?$[\${MUNASIP_DUR} - \${MUNASIP_BILL}]:)})`,
    ` same => n,Set(MUNASIP_DISP=\${IF($["\${DIALSTATUS}"=""]?ANSWER:\${DIALSTATUS})})`,
    ` same => n,${internalPost(
      "cdr",
      `{"callId":"\${UNIQUEID}","caller":"\${MUNASIP_CID}","callee":"\${MUNASIP_CALLEE}","disposition":"\${MUNASIP_DISP}","billsec":\${MUNASIP_BILL},"duration":\${MUNASIP_DUR},"wait":"\${MUNASIP_WAIT}","direction":"internal","mos":"\${MUNASIP_MOS}","jitter":"\${MUNASIP_JIT}","packetLoss":"\${MUNASIP_LOSS}"}`,
    )}`,
    " same => n,Goto(cdrdone)",
    // Caller left a queue (abandoned while waiting, or hung up on the agent)
    " same => n(hqueue),NoOp(Queue hangup CDR ${MUNASIP_QUEUE})",
    " same => n,UnpauseQueueMember(${MUNASIP_QUEUE},PJSIP/${CALLERID(num)})",
    ...qosPrepLines({ dialedTime: false, cdrDuration: true }),
    ...queueOutcomeLines("hqout"),
    ` same => n,Set(MUNASIP_DISP=\${IF($["\${MUNASIP_AGENT}" = ""]?NOANSWER:ANSWER)})`,
    ` same => n,${internalPost(
      "cdr",
      `{"callId":"\${UNIQUEID}","caller":"\${MUNASIP_CID}","callee":"\${MUNASIP_QUEUE}","disposition":"\${MUNASIP_DISP}","billsec":\${MUNASIP_BILL},"duration":\${MUNASIP_CDRDUR},"direction":"internal","queueNumber":"\${MUNASIP_QUEUE}","extension":"\${MUNASIP_AGENT}","wait":"\${MUNASIP_QWAIT}","mos":"\${MUNASIP_MOS}","jitter":"\${MUNASIP_JIT}","packetLoss":"\${MUNASIP_LOSS}"}`,
    )}`,
    " same => n(cdrdone),NoOp(CDR done)",
    "",
  );

  // Voicemail deposit via Record → API (portal inbox). Path under shared munasip volume.
  const vmDeposit = (num: string) => [
    `exten => *${num},1,NoOp(Voicemail deposit ${num})`,
    ` same => n,Answer()`,
    ` same => n,Playback(beep)`,
    ` same => n,Set(VMFILE=/var/lib/asterisk/munasip/voicemail/${num}-\${UNIQUEID})`,
    ` same => n,Record(\${VMFILE}.wav,3,120,kq)`,
    ` same => n,Set(MUNASIP_CID=\${CALLERID(num)})`,
    ` same => n,${internalPost("voicemail", `{"extension":"${num}","caller":"\${MUNASIP_CID}","file":"\${VMFILE}.wav"}`)}`,
    ` same => n,Hangup()`,
    "",
  ];
  for (const ext of exts) {
    extensionsConf.push(...vmDeposit(ext.number));
  }

  // Ring groups / queues / emergency / outbound MUST stay in [from-internal]
  // (do not open another context before these).
  for (const rg of rgs) {
    const members = rgMembers
      .filter((m) => m.ringGroupId === rg.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => exts.find((e) => e.id === m.extensionId))
      .filter(Boolean);
    if (rg.strategy === "linear" || rg.strategy === "sequence") {
      // Ring one-by-one until answer
      const lines = [
        `exten => ${rg.number},1,NoOp(Ring group ${rg.name} linear)`,
      ];
      for (const e of members) {
        lines.push(` same => n,Dial(PJSIP/${e!.number},${rg.ringSeconds},tT)`);
        lines.push(` same => n,GotoIf($["\${DIALSTATUS}" = "ANSWER"]?rgdone)`);
      }
      lines.push(` same => n(rgdone),Hangup()`, "");
      extensionsConf.push(...lines);
    } else {
      const dial = members.map((e) => `PJSIP/${e!.number}`).join("&");
      extensionsConf.push(
        `exten => ${rg.number},1,NoOp(Ring group ${rg.name})`,
        ` same => n,Dial(${dial},${rg.ringSeconds},tT)`,
        ` same => n,Hangup()`,
        "",
      );
    }
  }

  for (const q of qs) {
    const toApp = resolveQueueDest(q.timeoutDestType, q.timeoutDestId) ?? "Hangup()";
    const fullApp = resolveQueueDest(q.fullDestType, q.fullDestId) ?? "Hangup()";
    const jeApp = resolveQueueDest(q.joinemptyDestType, q.joinemptyDestId) ?? "Hangup()";
    const afterQueue = [
      ` same => n,GotoIf($["\${QUEUESTATUS}" = "TIMEOUT"]?qto)`,
      ` same => n,GotoIf($["\${QUEUESTATUS}" = "FULL"]?qfull)`,
      ` same => n,GotoIf($["\${QUEUESTATUS}" = "JOINEMPTY"]?qje)`,
      ` same => n,GotoIf($["\${QUEUESTATUS}" = "LEAVEEMPTY"]?qje)`,
      ` same => n,Hangup()`,
      ` same => n(qto),${toApp}`,
      ` same => n,Hangup()`,
      ` same => n(qfull),${fullApp}`,
      ` same => n,Hangup()`,
      ` same => n(qje),${jeApp}`,
      ` same => n,Hangup()`,
    ];
    // QUEUE_PRIO (set by flow VIP / priority var) is honored by Queue()
    // MEMBERINTERFACE=PJSIP/101 → agent extension for the portal call history
    const queueCdrLines = [
      ...qosPrepLines({ dialedTime: false, cdrDuration: true }),
      ` same => n,Set(MUNASIP_DISP=\${IF($["\${QUEUESTATUS}"=""]?ANSWER:\${QUEUESTATUS})})`,
      ...queueOutcomeLines("qout"),
      ` same => n,${internalPost(
        "cdr",
        `{"callId":"\${UNIQUEID}","caller":"\${MUNASIP_CID}","callee":"${q.number}","disposition":"\${MUNASIP_DISP}","billsec":\${MUNASIP_BILL},"duration":\${MUNASIP_CDRDUR},"direction":"internal","queueNumber":"${q.number}","extension":"\${MUNASIP_AGENT}","wait":"\${MUNASIP_QWAIT}","mos":"\${MUNASIP_MOS}","jitter":"\${MUNASIP_JIT}","packetLoss":"\${MUNASIP_LOSS}"}`,
      )}`,
      ` same => n,Set(MUNASIP_CDR_DONE=1)`,
    ];
    // Queue-level MixMonitor (shared spool → recordings panel)
    const qRecFile = `/var/spool/asterisk/recording/\${UNIQUEID}-q${q.number}.wav`;
    const qRecRegister = internalPost(
      "recording",
      `{"callId":"\${UNIQUEID}","file":"/data/recordings/\${UNIQUEID}-q${q.number}.wav","extension":"${q.number}","duration":\${MUNASIP_BILL}}`,
    );
    // TTS announce language (sounds under /var/lib/asterisk/sounds/<lang>/)
    let qLang: "tr" | "en" = config.defaultLocale === "tr" ? "tr" : "en";
    try {
      const [srow] = await db.select().from(settings).limit(1);
      const s = SettingsSchema.parse(srow?.data ?? {});
      if (s.defaultLocale === "tr" || s.defaultLocale === "en") qLang = s.defaultLocale;
    } catch {
      /* keep env default */
    }
    qLang = queueLanguage(q.language, qLang);
    // Answer → MOH first → entry TTS → Queue (periodic position/holdtime while waiting)
    const mohName = moh.find((m) => m.id === q.mohId)?.name ?? "default";
    const queueHead = [
      `exten => ${q.number},1,NoOp(Queue ${q.name})`,
      ` same => n,Answer()`,
      // Hangup handler `h` posts the CDR if the caller leaves before Queue() returns
      ` same => n,Set(MUNASIP_QUEUE=${q.number})`,
      ` same => n,Set(MUNASIP_QSTART=)`,
      // tr_ema / en_male … = that voice's clips, falling back to tr / en
      ` same => n,Set(CHANNEL(language)=${queueSoundLanguage(qLang, q.voice)})`,
      ` same => n,Set(CHANNEL(musicclass)=${mohName})`,
      ` same => n,PauseQueueMember(${q.number},PJSIP/\${CALLERID(num)})`,
      ` same => n,GotoIf($["\${KVKK_DONE}" = "1"]?qkvkk)`,
      ` same => n,Set(__KVKK_DONE=1)`,
      kvkkEnabled ? kvkkPlaybackLine(kvkkPromptId) : ` same => n,NoOp(KVKK off)`,
      ` same => n(qkvkk),MixMonitor(${qRecFile})`,
      // Hold music starts right away
      ` same => n,StartMusicOnHold(${mohName})`,
      ` same => n,Wait(1)`,
    ];
    // First announcement: one cached TTS sentence; MOH pauses during Playback and resumes with Queue()
    if (q.announcePosition) {
      queueHead.push(
        ` same => n,Set(MYQPOS=$[$\{QUEUE_WAITING_COUNT(${q.number})} + 1])`,
        ` same => n,GotoIf($[\${MYQPOS} < 1]?qannhold)`,
        ` same => n,GotoIf($[\${MYQPOS} > 30]?qannhold)`,
        ` same => n,Playback(qpos/\${MYQPOS})`,
      );
    }
    // Optional first hold-time announcement (roughly position × 1 min, 1–30)
    if (q.announceHoldtime) {
      queueHead.push(
        ` same => n(qannhold),Set(MYQHOLD=$[$\{QUEUE_WAITING_COUNT(${q.number})} + 1])`,
        ` same => n,GotoIf($[\${MYQHOLD} < 1]?qjoin)`,
        ` same => n,GotoIf($[\${MYQHOLD} > 30]?qjoin)`,
        ` same => n,Playback(qhold/\${MYQHOLD})`,
        ` same => n(qjoin),NoOp(Join queue)`,
      );
    } else {
      queueHead.push(
        ` same => n(qannhold),NoOp(No hold announce)`,
        ` same => n(qjoin),NoOp(Join queue)`,
      );
    }
    const queueTail = [
      ` same => n,StopMixMonitor()`,
      ...qosPrepLines({ dialedTime: false }),
      ` same => n,${qRecRegister}`,
      ` same => n,UnpauseQueueMember(${q.number},PJSIP/\${CALLERID(num)})`,
      ...queueCdrLines,
      ...afterQueue,
    ];
    // QUEUE_PRIO channel var (set by flow VIP) is read by Queue() for priority jump
    const queueApp = `Queue(${q.number},tT,,,${q.maxWait})`;
    if (q.callbackEnabled) {
      // Offer callback (TTS), hangup keeps place; job dials when agents free
      extensionsConf.push(
        ...queueHead,
        ` same => n,Playback(queue-callback-offer)`,
        ` same => n,Read(CALLBACK_OPT,silence/1,1,,,2,5)`,
        ` same => n,GotoIf($["\${CALLBACK_OPT}" = "1"]?cb)`,
        ` same => n,Set(MUNASIP_QSTART=\${EPOCH})`,
        ` same => n,${queueApp}`,
        ...queueTail,
        ` same => n(cb),NoOp(Queue callback requested — keep place)`,
        ` same => n,Set(CBPLACE=$[$\{QUEUE_WAITING_COUNT(${q.number})} + 1])`,
        ` same => n,Set(MUNASIP_CID=\${CALLERID(num)})`,
        ` same => n,Set(DB(QCB/${q.number}/\${MUNASIP_CID})=\${EPOCH}|\${CBPLACE})`,
        ` same => n,${internalPost("queue-callback", `{"queue":"${q.number}","number":"\${MUNASIP_CID}","place":\${CBPLACE}}`)}`,
        // Callback keeps the caller's place — not an abandoned call
        ` same => n,Set(MUNASIP_CDR_DONE=1)`,
        ` same => n,StopMixMonitor()`,
        ` same => n,UnpauseQueueMember(${q.number},PJSIP/\${MUNASIP_CID})`,
        ` same => n,Playback(queue-callback-confirm)`,
        ` same => n,Hangup()`,
        "",
      );
    } else {
      extensionsConf.push(
        ...queueHead,
        ` same => n,Set(MUNASIP_QSTART=\${EPOCH})`,
        ` same => n,${queueApp}`,
        ...queueTail,
        "",
      );
    }
  }

  // Emergency numbers — always dial (bypass Stasis policy)
  for (const em of ["112", "911", "155", "110"]) {
    extensionsConf.push(
      `exten => ${em},1,NoOp(Emergency ${em})`,
      ` same => n,Stasis(munasip-outbound,${em})`,
      ` same => n,Hangup()`,
      "",
    );
  }

  extensionsConf.push(
    "exten => _X.,1,NoOp(Outbound ${EXTEN})",
    " same => n,Stasis(munasip-outbound,${EXTEN})",
    " same => n,Hangup()",
    "",
  );

  // Dedicated context for flow-runtime voicemail redirects (after from-internal)
  extensionsConf.push("[munasip-voicemail]", "");
  for (const ext of exts) {
    extensionsConf.push(
      `exten => *${ext.number},1,Goto(from-internal,*${ext.number},1)`,
      `exten => ${ext.number},1,Goto(from-internal,*${ext.number},1)`,
      "",
    );
  }

  // Website widgets: guest may only dial their widget DID
  extensionsConf.push(
    "[from-widget]",
    "exten => _X.,1,NoOp(Widget guest ${CHANNEL(endpoint)} dial ${EXTEN})",
    " same => n,GotoIf($[\"${EXTEN}\" = \"${MUNASIP_WIDGET_NUM}\"]?ok:deny)",
    " same => n(deny),Playback(ss-noservice)",
    " same => n,Hangup(21)",
    " same => n(ok),Set(TIMEOUT(absolute)=${IF($[\"${MUNASIP_WIDGET_MAX}\"=\"\"]?600:${MUNASIP_WIDGET_MAX})})",
    " same => n,Stasis(munasip-inbound,${EXTEN},${CALLERID(num)})",
    " same => n,Hangup()",
    "",
  );

  try {
    const widgets = await db.select().from(webWidgets).where(eq(webWidgets.enabled, true));
    for (const w of widgets) {
      extensionsConf.push(
        `; widget ${w.publicKey} DID ${w.number} -> ${w.destType}:${w.destId ?? ""}`,
      );
    }
  } catch {
    /* migrations may lag */
  }

  extensionsConf.push(
    "[from-trunk]",
    "exten => _X.,1,NoOp(Inbound DID ${EXTEN})",
    " same => n,Stasis(munasip-inbound,${EXTEN},${CALLERID(num)})",
    " same => n,Hangup()",
    "",
    "[stasis-flow]",
    "exten => _X.,1,Stasis(munasip-flow,${EXTEN})",
    " same => n,Hangup()",
    "",
    // Flow transfer: Dial then re-enter Stasis with DIALSTATUS on failure
    "[munasip-flow-dial]",
    "exten => s,1,NoOp(Flow dial ${MUNASIP_DIAL_TARGET})",
    " same => n,Dial(PJSIP/${MUNASIP_DIAL_TARGET},${IF($[\"${MUNASIP_DIAL_TIMEOUT}\"=\"\"]?30:${MUNASIP_DIAL_TIMEOUT})},tTm(${IF($[\"${MUNASIP_DIAL_MOH}\"=\"\"]?default:${MUNASIP_DIAL_MOH})}))",
    " same => n,GotoIf($[\"${DIALSTATUS}\" = \"ANSWER\"]?done)",
    " same => n,Stasis(munasip-flow,dial-failed,${DIALSTATUS})",
    " same => n,Hangup()",
    // Answered: write CDR + MOS before hangup (inbound/IVR quality samples)
    " same => n(done),NoOp(Flow dial answered — CDR)",
    ...qosPrepLines({ dialedTime: false, cdrDuration: true }).map((l) =>
      l.replace(" same => n,", " same => n,"),
    ),
    ` same => n,${internalPost(
      "cdr",
      `{"callId":"\${UNIQUEID}","caller":"\${MUNASIP_CID}","callee":"\${MUNASIP_DIAL_TARGET}","disposition":"ANSWERED","billsec":\${MUNASIP_BILL},"duration":\${MUNASIP_CDRDUR},"direction":"internal","extension":"\${MUNASIP_DIAL_TARGET}","mos":"\${MUNASIP_MOS}","jitter":"\${MUNASIP_JIT}","packetLoss":"\${MUNASIP_LOSS}"}`,
    )}`,
    " same => n,Hangup()",
    "",
    // ARI continue: trunk_XXXXXXXX_<digits> → Dial(PJSIP/digits@trunk_XXXXXXXX)
    "[munasip-trunk-dial]",
    // "[n]": a bare N in an Asterisk pattern means [2-9], so "_trunk_." never matched
    "exten => _tru[n]k_.,1,NoOp(Trunk dial ${EXTEN})",
    " same => n,Set(TRUNK=${EXTEN:0:14})",
    " same => n,Set(NUM=${EXTEN:15})",
    " same => n(dial),Dial(PJSIP/${NUM}@${TRUNK},120)",
    // Provider failover: next trunk from MUNASIP_TRUNK_FALLBACK (set by ARI, '&'-separated)
    ' same => n,GotoIf($[("${DIALSTATUS}" = "CHANUNAVAIL" | "${DIALSTATUS}" = "CONGESTION") & "${MUNASIP_TRUNK_FALLBACK}" != ""]?next)',
    // Finalize CDR with real talk time (Stasis left via continue — no ARI hangup event)
    ...qosPrepLines({ dialedTime: false, cdrDuration: true }),
    ` same => n,${internalPost(
      "cdr",
      `{"callId":"\${UNIQUEID}","caller":"\${MUNASIP_CID}","callee":"\${NUM}","disposition":"\${DIALSTATUS}","billsec":\${MUNASIP_BILL},"duration":\${MUNASIP_CDRDUR},"direction":"outbound","mos":"\${MUNASIP_MOS}","jitter":"\${MUNASIP_JIT}","packetLoss":"\${MUNASIP_LOSS}"}`,
    )}`,
    " same => n,Hangup()",
    " same => n(next),Set(TRUNK=${CUT(MUNASIP_TRUNK_FALLBACK,&,1)})",
    " same => n,Set(MUNASIP_TRUNK_FALLBACK=${CUT(MUNASIP_TRUNK_FALLBACK,&,2-)})",
    " same => n,NoOp(Trunk failover ${DIALSTATUS} → ${TRUNK})",
    " same => n,Goto(dial)",
    "",
  );

  for (const route of inbound.sort((a, b) => a.priority - b.priority)) {
    extensionsConf.push(
      `; inbound ${route.did} -> ${route.destType}:${route.destId ?? ""} caller=${route.callerPattern ?? "*"}`,
    );
  }

  for (const route of outbound) {
    extensionsConf.push(
      `; outbound ${route.name} pattern=${route.pattern} trunks=${JSON.stringify(route.trunkIds)}`,
    );
  }

  // MOH under shared munasip volume (API upload + Asterisk playback)
  const mohConf = ["; MunaSIP musiconhold — generated", ""];
  const mohRoot = path.join(dir, "moh");
  await ensureDir(path.join(mohRoot, "default"));
  const seen = new Set<string>();
  for (const m of moh) {
    const classDir = path.join(mohRoot, m.name.replace(/[^\w.-]/g, "_") || "default");
    await ensureDir(classDir);
    mohConf.push(`[${m.name}]`, "mode=files", `directory=${classDir}`, "");
    seen.add(m.name);
  }
  if (!seen.has("default")) {
    mohConf.push("[default]", "mode=files", `directory=${path.join(mohRoot, "default")}`, "");
  }

  const writeOpts = { mode: 0o644 } as const;
  /** Write a config file; true when its content actually changed. */
  const put = async (name: string, content: string): Promise<boolean> => {
    const file = path.join(dir, name);
    const before = await readFile(file, "utf8").catch(() => null);
    await writeFile(file, content, writeOpts);
    return before !== content;
  };
  // First run after boot reloads everything (Asterisk may have loaded older files)
  // except the ACL, which only reloads on a real change — an ACL reload already
  // reloads res_pjsip, see reloadPlan.
  const changes: ConfigChanges = {
    pjsip: (await put("pjsip_munasip.conf", pjsip.join("\n"))) || firstReload,
    acl: await put("acl_munasip.conf", namedAclConf.join("\n")),
    queues: (await put("queues_munasip.conf", queuesConf.join("\n"))) || firstReload,
    extensions: (await put("extensions_munasip.conf", extensionsConf.join("\n"))) || firstReload,
    moh: (await put("musiconhold_munasip.conf", mohConf.join("\n"))) || firstReload,
  };

  await ensureAsteriskCanReadConfig(dir);
  // One reload path only. The API reloads over the CLI when it can (all-in-one);
  // reload.flag (watched by start-asterisk.sh / the Compose sidecar) is the fallback.
  // Writing both made two reload sequences race — the deadlock described above.
  // Seed sets MUNASIP_ASTERISK_CLI_RELOAD=0 so it never blocks on Asterisk.
  const cliReloaded =
    process.env.MUNASIP_ASTERISK_CLI_RELOAD !== "0" ? await reloadAsteriskCli(changes) : false;
  if (!cliReloaded) {
    await writeFile(path.join(dir, "reload.flag"), `${Date.now()}\n`, writeOpts);
  }

  // Keep dialplan DND checks in sync with Postgres
  try {
    const { seedDndFromDb } = await import("../lib/astdb-dnd.js");
    await seedDndFromDb(exts.map((e) => ({ number: e.number, dnd: e.dnd })));
  } catch (e) {
    console.warn("[config] DND AstDB seed skipped:", (e as Error).message);
  }

  // Queue TTS pack: position/holdtime + callback offer/confirm prompts
  const needAnnounce = qs.some(
    (q) => q.announcePosition || q.announceHoldtime || q.callbackEnabled,
  );
  if (needAnnounce) {
    void import("../lib/queue-announce-tts.js")
      .then(({ ensureQueueAnnounceSounds }) => ensureQueueAnnounceSounds())
      .catch((e) => console.warn("[config] queue TTS pack:", (e as Error).message));
  }
}

export async function tryReloadAsterisk(): Promise<boolean> {
  try {
    await writeAsteriskConfig();
    const auth = Buffer.from(
      `${config.asterisk.ariUser}:${config.asterisk.ariPassword}`,
    ).toString("base64");
    const res = await fetch(`${config.asterisk.ariUrl}/ari/asterisk/info`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
