import { lookup as dnsLookup } from "node:dns/promises";
import { SettingsSchema } from "@monosip/shared";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";
import {
  DEFAULT_STUN_SERVERS,
  discoverPublicIpv4ViaStun,
  isPrivateOrLocalIpv4,
  normalizeStunServerList,
} from "./stun-discover.js";

export type ExternalIpSource = "env" | "stun" | "dns" | "env-private" | "none";

export type ExternalIpResult = {
  ip: string;
  source: ExternalIpSource;
  stunServers: string[];
  stunEnabled: boolean;
};

type Cache = { at: number; result: ExternalIpResult };
let cache: Cache | null = null;
let inflight: Promise<ExternalIpResult> | null = null;
const CACHE_MS = 5 * 60 * 1000;

export function clearExternalIpCache(): void {
  cache = null;
  inflight = null;
}

export async function loadStunSettings(): Promise<{ enabled: boolean; servers: string[] }> {
  try {
    const [row] = await db.select().from(settings).limit(1);
    const s = SettingsSchema.parse(row?.data ?? {});
    return {
      enabled: s.stunEnabled !== false,
      servers: normalizeStunServerList(s.stunServers),
    };
  } catch {
    return { enabled: true, servers: [...DEFAULT_STUN_SERVERS] };
  }
}

/**
 * Public IPv4 for Asterisk external_* / media_address and health.
 * Prefer a public EXTERNAL_IP env; otherwise STUN; then DNS of PUBLIC_HOST;
 * finally a private EXTERNAL_IP if that is all we have.
 */
export async function resolveExternalIpDetailed(opts?: {
  force?: boolean;
}): Promise<ExternalIpResult> {
  if (!opts?.force && cache && Date.now() - cache.at < CACHE_MS) {
    return cache.result;
  }
  // Boot races media-readiness + config-writer; share one discovery.
  if (!opts?.force && inflight) return inflight;

  const run = (async (): Promise<ExternalIpResult> => {
    const stun = await loadStunSettings();
    const envIp = (config.externalIp || "").trim();
    const envPublic = envIp && !isPrivateOrLocalIpv4(envIp) ? envIp : "";

    if (envPublic) {
      const result: ExternalIpResult = {
        ip: envPublic,
        source: "env",
        stunServers: stun.servers,
        stunEnabled: stun.enabled,
      };
      cache = { at: Date.now(), result };
      return result;
    }

    if (stun.enabled) {
      const viaStun = await discoverPublicIpv4ViaStun(stun.servers);
      if (viaStun) {
        const result: ExternalIpResult = {
          ip: viaStun,
          source: "stun",
          stunServers: stun.servers,
          stunEnabled: stun.enabled,
        };
        cache = { at: Date.now(), result };
        console.info(`[nat] EXTERNAL_IP via STUN: ${viaStun} (${stun.servers[0]})`);
        return result;
      }
    }

    const host = (config.publicHost || "").trim();
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      try {
        const r = await dnsLookup(host, { family: 4 });
        if (r.address) {
          const result: ExternalIpResult = {
            ip: r.address,
            source: "dns",
            stunServers: stun.servers,
            stunEnabled: stun.enabled,
          };
          cache = { at: Date.now(), result };
          return result;
        }
      } catch {
        /* fall through */
      }
    }

    if (envIp) {
      const result: ExternalIpResult = {
        ip: envIp,
        source: "env-private",
        stunServers: stun.servers,
        stunEnabled: stun.enabled,
      };
      cache = { at: Date.now(), result };
      return result;
    }

    const result: ExternalIpResult = {
      ip: "",
      source: "none",
      stunServers: stun.servers,
      stunEnabled: stun.enabled,
    };
    cache = { at: Date.now(), result };
    return result;
  })();

  if (!opts?.force) {
    inflight = run.finally(() => {
      inflight = null;
    });
    return inflight;
  }
  return run;
}

export async function resolveExternalIp(force = false): Promise<string> {
  const r = await resolveExternalIpDetailed({ force });
  return r.ip;
}
