/**
 * In-memory login flood guard (complements fail2ban).
 * Thresholds come from Settings when callers pass them.
 */

type FailRow = { count: number; until: number };

const fails = new Map<string, FailRow>();

const DEFAULT_MAX = 8;
const DEFAULT_BAN_MS = 15 * 60_000;

export function isIpBanned(ip: string, maxRetry = DEFAULT_MAX): boolean {
  const row = fails.get(ip);
  if (!row) return false;
  if (Date.now() > row.until) {
    fails.delete(ip);
    return false;
  }
  return row.count >= maxRetry;
}

export function recordLoginFailure(
  ip: string,
  opts?: { maxRetry?: number; banMinutes?: number },
): { banned: boolean; count: number } {
  const maxRetry = opts?.maxRetry ?? DEFAULT_MAX;
  const banMs = (opts?.banMinutes ?? 15) * 60_000;
  const row = fails.get(ip) ?? { count: 0, until: 0 };
  row.count += 1;
  if (row.count >= maxRetry) {
    row.until = Date.now() + (banMs || DEFAULT_BAN_MS);
  }
  fails.set(ip, row);
  return { banned: row.count >= maxRetry, count: row.count };
}

export function clearLoginFailures(ip: string) {
  fails.delete(ip);
}

/** Snapshot of currently banned IPs (for panel). */
export function listMemoryBans(maxRetry = DEFAULT_MAX): Array<{
  ip: string;
  count: number;
  until: number;
}> {
  const now = Date.now();
  const out: Array<{ ip: string; count: number; until: number }> = [];
  for (const [ip, row] of fails) {
    if (row.count >= maxRetry && row.until > now) {
      out.push({ ip, count: row.count, until: row.until });
    }
  }
  return out;
}
