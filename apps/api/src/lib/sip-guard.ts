/**
 * Built-in SIP brute-force guard (fail2ban for the all-in-one image).
 *
 * Listens to Asterisk's AMI "security" events. An address that fails SIP
 * authentication too often (unknown account / wrong password) is banned: the
 * ban lands in ip_bans, which config-writer turns into the SIP ACL deny list.
 * Loopback (WebSocket softphones arrive through the API proxy), private
 * networks, the SIP allowlist and trunk hosts are never banned.
 */
import net from "node:net";
import { config } from "../config.js";

/** Security events that mean "someone failed to authenticate". */
const FAILURE_EVENTS = new Set(["InvalidAccountID", "ChallengeResponseFailed", "InvalidPassword"]);

export const SIP_GUARD_DEFAULTS = {
  /** Failures from one address within `windowMs` that trigger a ban */
  threshold: 10,
  windowMs: 60_000,
  banMs: 24 * 60 * 60_000,
};

/** "IPV4/UDP/160.119.71.252/5065" → "160.119.71.252" */
export function parseRemoteAddress(raw: string | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split("/");
  const ip = parts.length >= 3 ? parts[2]! : raw;
  return net.isIP(ip) ? ip : null;
}

/** Address of a failed-authentication AMI security event, else null. */
export function failedAuthAddress(event: Record<string, string>): string | null {
  if (!event.Event || !FAILURE_EVENTS.has(event.Event)) return null;
  return parseRemoteAddress(event.RemoteAddress);
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}

/** `ip` inside `cidr` (IPv4 CIDR or a plain address of either family). */
export function ipMatches(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.trim().split("/");
  if (!base) return false;
  if (!net.isIPv4(ip) || !net.isIPv4(base)) return ip === base;
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const ALWAYS_EXEMPT = ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "::1"];

/** Sliding-window failure counter; calls `onBan` once per address per ban. */
export function createSipGuard(opts: {
  threshold?: number;
  windowMs?: number;
  banMs?: number;
  isExempt: (ip: string) => boolean | Promise<boolean>;
  onBan: (ip: string, failures: number) => Promise<void>;
  now?: () => number;
}) {
  const threshold = opts.threshold ?? SIP_GUARD_DEFAULTS.threshold;
  const windowMs = opts.windowMs ?? SIP_GUARD_DEFAULTS.windowMs;
  const banMs = opts.banMs ?? SIP_GUARD_DEFAULTS.banMs;
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();
  /** address → banned until (ms) */
  const banned = new Map<string, number>();

  return {
    /** Feed one AMI event. Resolves true when it caused a ban. */
    async observe(event: Record<string, string>): Promise<boolean> {
      const ip = failedAuthAddress(event);
      const t = now();
      if (!ip || (banned.get(ip) ?? 0) > t) return false;
      const recent = (hits.get(ip) ?? []).filter((x) => t - x < windowMs);
      recent.push(t);
      hits.set(ip, recent);
      if (recent.length < threshold) return false;
      hits.delete(ip);
      if (await opts.isExempt(ip)) return false;
      banned.set(ip, t + banMs);
      await opts.onBan(ip, recent.length);
      return true;
    },
    /** Forget an address (e.g. its ban was lifted in the panel). */
    forget(ip: string) {
      banned.delete(ip);
      hits.delete(ip);
    },
    /** Drop stale counters so a slow trickle of scanners can't grow memory. */
    sweep() {
      const t = now();
      for (const [ip, list] of hits) {
        if (!list.some((x) => t - x < windowMs)) hits.delete(ip);
      }
      for (const [ip, until] of banned) if (until <= t) banned.delete(ip);
    },
  };
}

async function isExemptAddress(ip: string): Promise<boolean> {
  const { loadSecuritySettings } = await import("./security-settings.js");
  const { db } = await import("../db/client.js");
  const { trunks } = await import("../db/schema.js");
  const sec = await loadSecuritySettings().catch(() => null);
  const trunkHosts = (await db.select({ host: trunks.host }).from(trunks).catch(() => []))
    .map((t) => t.host ?? "")
    .filter(Boolean);
  const rules = [...ALWAYS_EXEMPT, ...config.localNets, ...(sec?.sipIpAllowlist ?? []), ...trunkHosts];
  return rules.some((r) => ipMatches(ip, r));
}

async function banAddress(ip: string, failures: number): Promise<void> {
  const { upsertIpBan } = await import("./ip-bans.js");
  const { securityLog } = await import("./security-log.js");
  const { tryReloadAsterisk } = await import("../asterisk/config-writer.js");
  await upsertIpBan({
    ip,
    source: "fail2ban",
    reason: `SIP brute force: ${failures} failed attempts in ${SIP_GUARD_DEFAULTS.windowMs / 1000}s`,
    expiresAt: new Date(Date.now() + SIP_GUARD_DEFAULTS.banMs),
  });
  await securityLog(`sip-guard ban ${ip} (${failures} failures)`).catch(() => undefined);
  console.warn(`[sip-guard] banned ${ip} for 24h after ${failures} failed SIP attempts`);
  await tryReloadAsterisk();
}

/** Keep an AMI session open for security events; reconnects with backoff. */
export function startSipGuard(): void {
  if (process.env.DSIP_SIP_GUARD === "0") return;
  const guard = createSipGuard({ isExempt: isExemptAddress, onBan: banAddress });
  setInterval(() => guard.sweep(), 5 * 60_000).unref();
  let delay = 2_000;

  const connect = () => {
    const sock = net.connect({ host: config.asterisk.amiHost, port: config.asterisk.amiPort });
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("connect", () => {
      delay = 2_000;
      sock.write(
        [
          "Action: Login",
          `Username: ${config.asterisk.amiUser}`,
          `Secret: ${config.asterisk.amiPassword}`,
          "Events: security",
          "",
          "",
        ].join("\r\n"),
      );
    });
    sock.on("data", (chunk) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf("\r\n\r\n")) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 4);
        const ev: Record<string, string> = {};
        for (const line of block.split(/\r?\n/)) {
          const i = line.indexOf(":");
          if (i > 0) ev[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        }
        if (ev.Response === "Success" && /authentication accepted/i.test(ev.Message ?? "")) {
          console.log("[sip-guard] watching SIP authentication failures");
        }
        if (ev.Response === "Error") {
          console.warn("[sip-guard] AMI login refused:", ev.Message ?? "");
          sock.destroy();
          return;
        }
        if (ev.Event) {
          void guard.observe(ev).catch((e) => console.warn("[sip-guard]", (e as Error).message));
        }
      }
      // A broken peer must not grow the buffer forever
      if (buf.length > 1_000_000) buf = "";
    });
    sock.on("error", () => undefined);
    sock.on("close", () => {
      setTimeout(connect, delay).unref();
      delay = Math.min(delay * 2, 60_000);
    });
  };
  connect();
}
