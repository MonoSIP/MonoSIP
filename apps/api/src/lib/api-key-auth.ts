import { verifyTokenHash } from "./crypto.js";

const WINDOW_MS = 60_000;
const MAX_FAILS = 20;

type Bucket = { n: number; reset: number };
const fails = new Map<string, Bucket>();

export function authBlocked(ip: string, now = Date.now()): boolean {
  const bucket = fails.get(ip);
  if (!bucket || now >= bucket.reset) return false;
  return bucket.n >= MAX_FAILS;
}

export function noteAuthFailure(ip: string, now = Date.now()): void {
  const bucket = fails.get(ip);
  if (!bucket || now >= bucket.reset) {
    fails.set(ip, { n: 1, reset: now + WINDOW_MS });
    return;
  }
  bucket.n += 1;
}

export function clearAuthFailure(ip: string): void {
  fails.delete(ip);
}

export function verifyBarrier(presented: string | undefined, storedHash: string | null): boolean {
  if (!presented || !storedHash) return false;
  return verifyTokenHash(presented, storedHash);
}

export function keyExpired(expiresAt: Date | null, now = new Date()): boolean {
  return expiresAt != null && expiresAt.getTime() <= now.getTime();
}
