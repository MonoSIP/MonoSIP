/**
 * PBX-wide time zone and clock drift check.
 *
 * The time zone comes from Settings (default Europe/Istanbul). It is applied to
 * this process (TZ), so schedules, nightly jobs and reports all use it, and the
 * web UI formats every time with it instead of the viewer's browser zone.
 *
 * A container cannot set the host clock (no CAP_SYS_TIME), so NTP here measures
 * the offset and warns; the host (systemd-timesyncd / chrony) keeps time.
 */
import dgram from "node:dgram";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { SettingsSchema, isValidTimeZone } from "@monosip/shared";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";

export const DEFAULT_TIMEZONE = "Europe/Istanbul";
/** Above this the panel shows a warning: schedules and call times start to be wrong. */
export const MAX_DRIFT_MS = 2000;

let currentTz = DEFAULT_TIMEZONE;

/** Time zone the PBX runs in right now. */
export function systemTimezone(): string {
  return currentTz;
}

/** Use `tz` for this process. Unknown zones keep the previous one. */
export function applyTimezone(tz: string | null | undefined): string {
  const next = tz?.trim();
  if (next && isValidTimeZone(next)) {
    currentTz = next;
    process.env.TZ = next;
  }
  return currentTz;
}

/**
 * Asterisk and the container OS read the zone at boot (start script links
 * /etc/localtime from this file), so log and CDR CSV times match Settings.
 */
export async function writeAsteriskTimezoneFile(tz: string): Promise<void> {
  await writeFile(path.join(config.asterisk.configDir, "timezone"), `${tz}\n`).catch((e) =>
    console.warn("[time] timezone file", (e as Error).message),
  );
}

/** Read Settings and apply its time zone (boot and after a settings save). */
export async function loadSystemTimezone(): Promise<string> {
  try {
    const [row] = await db.select().from(settings).where(eq(settings.id, 1));
    const s = SettingsSchema.parse(row?.data ?? {});
    return applyTimezone(s.timezone);
  } catch (e) {
    console.warn("[time] settings unreadable, keeping", currentTz, (e as Error).message);
    return currentTz;
  }
}

/** UTC offset of `tz` at `at`, e.g. "+03:00". */
export function utcOffsetLabel(tz: string, at = new Date()): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : "+00:00";
}

export type ClockCheck = {
  ok: boolean;
  server: string | null;
  /** Local clock minus NTP time, in ms (positive = local clock is ahead). */
  offsetMs: number | null;
  roundTripMs: number | null;
  checkedAt: string;
  error: string | null;
};

let lastCheck: ClockCheck | null = null;

export function lastClockCheck(): ClockCheck | null {
  return lastCheck;
}

const NTP_EPOCH_OFFSET = 2208988800; // seconds from 1900 to 1970

function readNtpTimestamp(buf: Buffer, offset: number): number {
  const seconds = buf.readUInt32BE(offset);
  const fraction = buf.readUInt32BE(offset + 4);
  return (seconds - NTP_EPOCH_OFFSET) * 1000 + (fraction * 1000) / 2 ** 32;
}

/** Offset math from RFC 4330 (SNTP): t1 sent, t2 server rx, t3 server tx, t4 received. */
export function sntpOffset(t1: number, t2: number, t3: number, t4: number) {
  return {
    // Positive when the local clock is ahead of the server.
    offsetMs: Math.round(((t1 - t2) + (t4 - t3)) / 2),
    roundTripMs: Math.round(t4 - t1 - (t3 - t2)),
  };
}

/** One SNTP query to `server` (host or host:port). */
export function querySntp(
  server: string,
  timeoutMs = 3000,
): Promise<{ offsetMs: number; roundTripMs: number }> {
  const [host, portStr] = server.replace(/^ntp:\/\//i, "").split(":");
  const port = Number(portStr) || 123;
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      sock.close();
      reject(new Error(`no answer from ${server}`));
    }, timeoutMs);
    const req = Buffer.alloc(48);
    req[0] = 0x23; // LI 0, version 4, mode 3 (client)
    let t1 = 0;
    sock.once("error", (e) => {
      clearTimeout(timer);
      sock.close();
      reject(e);
    });
    sock.once("message", (msg) => {
      const t4 = Date.now();
      clearTimeout(timer);
      sock.close();
      if (msg.length < 48 || (msg[0] & 0x07) !== 4) {
        reject(new Error(`bad NTP reply from ${server}`));
        return;
      }
      resolve(sntpOffset(t1, readNtpTimestamp(msg, 32), readNtpTimestamp(msg, 40), t4));
    });
    t1 = Date.now();
    sock.send(req, port, host, (e) => {
      if (!e) return;
      clearTimeout(timer);
      sock.close();
      reject(e);
    });
  });
}

/** Try the configured servers in order; remember and return the result. */
export async function checkClock(servers?: string[]): Promise<ClockCheck> {
  let list = servers;
  if (!list) {
    try {
      const [row] = await db.select().from(settings).where(eq(settings.id, 1));
      const s = SettingsSchema.parse(row?.data ?? {});
      list = s.ntpEnabled ? s.ntpServers : [];
    } catch {
      list = [];
    }
  }
  const checkedAt = new Date().toISOString();
  if (!list.length) {
    lastCheck = { ok: true, server: null, offsetMs: null, roundTripMs: null, checkedAt, error: null };
    return lastCheck;
  }
  let error = "no NTP server configured";
  for (const server of list) {
    try {
      const r = await querySntp(server);
      const ok = Math.abs(r.offsetMs) <= MAX_DRIFT_MS;
      if (!ok) console.warn(`[time] clock is ${r.offsetMs} ms off ${server}; fix NTP on the host`);
      lastCheck = { ok, server, offsetMs: r.offsetMs, roundTripMs: r.roundTripMs, checkedAt, error: null };
      return lastCheck;
    } catch (e) {
      error = (e as Error).message;
    }
  }
  lastCheck = { ok: false, server: null, offsetMs: null, roundTripMs: null, checkedAt, error };
  return lastCheck;
}
