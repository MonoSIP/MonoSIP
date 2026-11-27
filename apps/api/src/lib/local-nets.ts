/** Default LOCAL_NETS for Docker / all-in-one (bridge + loopback). */
export const DEFAULT_LOCAL_NETS = ["172.16.0.0/12", "127.0.0.0/8"] as const;

function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  if (octets.some((o) => o > 255)) return null;
  return ((octets[0]! << 24) >>> 0) + (octets[1]! << 16) + (octets[2]! << 8) + octets[3]!;
}

/** True when IPv4 `ip` falls inside `cidr` (`a.b.c.d` or `a.b.c.d/n`). */
export function ipv4InCidr(ip: string, cidr: string): boolean {
  const [net, bitsRaw] = cidr.trim().split("/");
  const ipN = ipv4ToInt(ip);
  const netN = ipv4ToInt(net ?? "");
  if (ipN === null || netN === null) return false;
  const bits = bitsRaw === undefined || bitsRaw === "" ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
  return (ipN & mask) === (netN & mask);
}

function isLoopbackNet(cidr: string): boolean {
  return /^127\./.test(cidr.trim());
}

/**
 * Sanitize LOCAL_NETS for Asterisk `local_net=`.
 * - Fixes `127.0.0.1/3` (marks ~½ of public IPv4 as local) → `127.0.0.0/8`
 * - When EXTERNAL_IP is set, drops any net that contains it (except loopback):
 *   otherwise Docker NAT leaves Via/Contact on 172.x and Yealink/Fanvil go Unavail
 * - Falls back to {@link DEFAULT_LOCAL_NETS} if nothing remains
 */
export function normalizeLocalNets(nets: string[], externalIp = ""): string[] {
  const ext = externalIp.trim();
  const out: string[] = [];
  const seen = new Set<string>();
  const stripped: string[] = [];

  for (const raw of nets) {
    let n = raw.trim();
    if (!n) continue;
    if (/^127\.0\.0\.1\/3$/i.test(n)) n = "127.0.0.0/8";
    if (/^127\.0\.0\.1\/32$/i.test(n)) n = "127.0.0.0/8";

    if (ext && !isLoopbackNet(n) && ipv4InCidr(ext, n)) {
      stripped.push(n);
      continue;
    }
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }

  if (stripped.length) {
    console.warn(
      `[config] LOCAL_NETS dropped ${stripped.join(", ")} because EXTERNAL_IP=${ext} is inside them ` +
        `(Docker NAT would advertise the container address; phones go Unavail)`,
    );
  }

  return out.length ? out : [...DEFAULT_LOCAL_NETS];
}

export function parseLocalNetsEnv(value: string | undefined): string[] {
  return (value ?? DEFAULT_LOCAL_NETS.join(","))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * An EXTERNAL_IP that phones can never reach must not be used: the config
 * writer stamps it into every endpoint's `media_address`, which forces the SDP
 * connection address for all peers (LAN included). A loopback or unspecified
 * address there means no phone ever receives audio. This happened when
 * PUBLIC_HOST=localhost was resolved to 127.0.0.1 at boot.
 *
 * Returns the trimmed value, or "" when it is loopback (127.0.0.0/8, ::1),
 * unspecified (0.0.0.0, ::) or not an IP address — i.e. not reachable by phones
 * on other hosts. Used to warn at boot (see config.ts).
 */
export function usableExternalIp(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  if (v === "::1" || v === "::" || v === "0.0.0.0") return "";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
    if (ipv4ToInt(v) === null) return "";
    return ipv4InCidr(v, "127.0.0.0/8") ? "" : v;
  }
  return v.includes(":") ? v : ""; // IPv6 literal ok; hostnames are not IPs
}
