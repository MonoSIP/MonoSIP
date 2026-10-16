import { X509Certificate } from "node:crypto";

/** Renew when fewer than this many days remain. */
export const RENEW_WITHIN_DAYS = 30;

export function needsRenewal(expiresAt: Date | null, withinDays = RENEW_WITHIN_DAYS): boolean {
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return true;
  const ms = withinDays * 24 * 60 * 60 * 1000;
  return expiresAt.getTime() - Date.now() <= ms;
}

export function readCertExpiry(pem: string): Date | null {
  try {
    const x = new X509Certificate(pem);
    return new Date(x.validTo);
  } catch {
    return null;
  }
}
