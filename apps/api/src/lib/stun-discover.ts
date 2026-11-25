import dgram from "node:dgram";
import { randomBytes } from "node:crypto";

/** Well-known public STUN hosts (UDP). Used when settings leave the list empty. */
export const DEFAULT_STUN_SERVERS = [
  "stun.l.google.com:19302",
  "stun1.l.google.com:19302",
  "stun.cloudflare.com:3478",
] as const;

const MAGIC = 0x2112a442;
const BINDING_REQUEST = 0x0001;
const BINDING_SUCCESS = 0x0101;
const ATTR_MAPPED = 0x0001;
const ATTR_XOR_MAPPED = 0x0020;

export function parseStunHostPort(raw: string): { host: string; port: number } | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^stuns?:/i, "");
  if (s.includes("://")) {
    try {
      const u = new URL(s.includes("://") ? s : `stun://${s}`);
      const host = u.hostname;
      const port = u.port ? Number(u.port) : 3478;
      if (!host || !Number.isFinite(port)) return null;
      return { host, port };
    } catch {
      return null;
    }
  }
  const idx = s.lastIndexOf(":");
  if (idx > 0 && /^\d+$/.test(s.slice(idx + 1))) {
    return { host: s.slice(0, idx), port: Number(s.slice(idx + 1)) };
  }
  return { host: s, port: 3478 };
}

/** Parse Binding Success for mapped IPv4 (XOR-MAPPED-ADDRESS preferred). */
export function parseStunMappedIpv4(msg: Buffer, txId: Buffer): string | null {
  if (msg.length < 20) return null;
  const type = msg.readUInt16BE(0);
  if (type !== BINDING_SUCCESS) return null;
  const len = msg.readUInt16BE(2);
  if (msg.readUInt32BE(4) !== MAGIC) return null;
  if (!msg.subarray(8, 20).equals(txId)) return null;
  let off = 20;
  const end = Math.min(msg.length, 20 + len);
  let mapped: string | null = null;
  while (off + 4 <= end) {
    const atype = msg.readUInt16BE(off);
    const alen = msg.readUInt16BE(off + 2);
    const val = off + 4;
    const next = val + alen + ((4 - (alen % 4)) % 4);
    if (val + alen > end) break;
    if ((atype === ATTR_XOR_MAPPED || atype === ATTR_MAPPED) && alen >= 8) {
      const family = msg[val + 1];
      if (family === 0x01) {
        // IPv4
        const b0 = msg[val + 4]!;
        const b1 = msg[val + 5]!;
        const b2 = msg[val + 6]!;
        const b3 = msg[val + 7]!;
        if (atype === ATTR_XOR_MAPPED) {
          const x0 = b0 ^ ((MAGIC >>> 24) & 0xff);
          const x1 = b1 ^ ((MAGIC >>> 16) & 0xff);
          const x2 = b2 ^ ((MAGIC >>> 8) & 0xff);
          const x3 = b3 ^ (MAGIC & 0xff);
          mapped = `${x0}.${x1}.${x2}.${x3}`;
        } else {
          mapped = `${b0}.${b1}.${b2}.${b3}`;
        }
        if (atype === ATTR_XOR_MAPPED) return mapped;
      }
    }
    off = next;
  }
  return mapped;
}

function buildBindingRequest(txId: Buffer): Buffer {
  const buf = Buffer.alloc(20);
  buf.writeUInt16BE(BINDING_REQUEST, 0);
  buf.writeUInt16BE(0, 2);
  buf.writeUInt32BE(MAGIC, 4);
  txId.copy(buf, 8);
  return buf;
}

/** One STUN Binding against host:port; returns mapped IPv4 or null. */
export function stunQueryIpv4(host: string, port: number, timeoutMs = 2500): Promise<string | null> {
  return new Promise((resolve) => {
    const txId = randomBytes(12);
    const req = buildBindingRequest(txId);
    const sock = dgram.createSocket("udp4");
    let done = false;
    const finish = (ip: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        sock.close();
      } catch {
        /* ignore */
      }
      resolve(ip);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    sock.on("error", () => finish(null));
    sock.on("message", (msg) => {
      const ip = parseStunMappedIpv4(msg, txId);
      if (ip) finish(ip);
    });
    sock.send(req, port, host, (err) => {
      if (err) finish(null);
    });
  });
}

/**
 * Try STUN servers in order; return first public-looking mapped IPv4.
 * `servers` entries: `host:port` or `stun:host:port`.
 */
export async function discoverPublicIpv4ViaStun(
  servers: string[] = [...DEFAULT_STUN_SERVERS],
): Promise<string | null> {
  for (const raw of servers) {
    const hp = parseStunHostPort(raw);
    if (!hp) continue;
    try {
      const ip = await stunQueryIpv4(hp.host, hp.port);
      if (ip && !isPrivateOrLocalIpv4(ip)) return ip;
    } catch {
      /* next server */
    }
  }
  return null;
}

export function isPrivateOrLocalIpv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return true;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export function normalizeStunServerList(raw: string[] | undefined | null): string[] {
  const list = (raw ?? [])
    .flatMap((s) => s.split(/[\n,]+/))
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const hp = parseStunHostPort(s);
      return hp ? `${hp.host}:${hp.port}` : "";
    })
    .filter(Boolean);
  return list.length ? [...new Set(list)] : [...DEFAULT_STUN_SERVERS];
}
