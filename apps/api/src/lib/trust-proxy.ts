import { BlockList, isIP } from "node:net";

/**
 * Reverse-proxy trust for `req.ip`.
 *
 * `trustProxy: true` made `req.ip` the *leftmost* X-Forwarded-For entry, which
 * the client fully controls. An attacker could therefore rotate that header to
 * dodge the per-IP login-failure counter, or aim it at an allowlisted address
 * to have the ban land on somebody else.
 *
 * The proxy appends the address it observed to the *right* of the incoming
 * header (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`), so the
 * trustworthy value is the last entry. We trust exactly one hop: the immediate
 * peer must be a known proxy, and then `req.ip` is the single value that peer
 * appended. Everything to its left is attacker-supplied and is dropped.
 *
 * Hop counts are not an option — Fastify's own `getTrustProxyFn` fails closed on
 * them, because a count cannot validate the immediate peer.
 */

/** Strip the IPv4-mapped IPv6 prefix so `::ffff:10.0.0.5` matches an IPv4 rule. */
function normalizeIp(addr: string): string {
  return addr.startsWith("::ffff:") ? addr.slice(7) : addr;
}

/**
 * Parse proxy CIDRs into a lookup table.
 *
 * Throws on a malformed entry: a typo in the trusted-proxy list must fail at
 * boot rather than silently widen (or silently disable) who may set the
 * client's address.
 */
export function parseTrustedProxies(cidrs: readonly string[]): BlockList {
  const list = new BlockList();
  for (const raw of cidrs) {
    const entry = raw.trim();
    if (!entry) continue;
    const slash = entry.lastIndexOf("/");
    const addr = slash === -1 ? entry : entry.slice(0, slash);
    const prefix = slash === -1 ? undefined : entry.slice(slash + 1);
    const family = isIP(addr);
    if (family === 0) {
      throw new Error(`Invalid trusted proxy address: "${entry}"`);
    }
    const kind = family === 6 ? "ipv6" : "ipv4";
    try {
      if (prefix === undefined) {
        list.addAddress(addr, kind);
      } else {
        if (!/^\d+$/.test(prefix)) {
          throw new Error(`Invalid CIDR prefix in "${entry}"`);
        }
        list.addSubnet(addr, Number(prefix), kind);
      }
    } catch (e) {
      throw new Error(`Invalid trusted proxy address "${entry}": ${(e as Error).message}`);
    }
  }
  return list;
}

/**
 * Build the Fastify `trustProxy` function.
 *
 * Only hop 0 (the socket peer) may be trusted, so `req.ip` is always the
 * address the proxy itself observed — never a further, attacker-supplied entry.
 */
export function createTrustProxy(cidrs: readonly string[]): (addr: string, hop: number) => boolean {
  const list = parseTrustedProxies(cidrs);
  return (addr, hop) => {
    if (hop !== 0) return false;
    const ip = normalizeIp(addr);
    const kind = isIP(ip) === 6 ? "ipv6" : "ipv4";
    return list.check(ip, kind);
  };
}
