/** Match client IP against Settings adminIpAllowlist (exact or CIDR). Empty list = allow all. */
export function ipAllowed(clientIp: string, allowlist: string[]): boolean {
  if (!allowlist.length) return true;
  const ip = normalizeIp(clientIp);
  for (const entry of allowlist) {
    const rule = entry.trim();
    if (!rule) continue;
    if (rule.includes("/")) {
      if (matchCidr(ip, rule)) return true;
    } else if (normalizeIp(rule) === ip) {
      return true;
    }
  }
  return false;
}

function normalizeIp(ip: string): string {
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

function matchCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (!base || Number.isNaN(bits) || bits < 0 || bits > 32) return false;
  const ipN = ipv4ToInt(normalizeIp(ip));
  const baseN = ipv4ToInt(normalizeIp(base));
  if (ipN === null || baseN === null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
  return (ipN & mask) === (baseN & mask);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}
