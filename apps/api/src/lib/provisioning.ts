import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { devices } from "../db/schema.js";
import { decrypt, encrypt, randomSecret, safeEqual } from "./crypto.js";

/**
 * Desk-phone provisioning secret.
 *
 * GET /cfg/:mac hands a handset its SIP credentials, so the MAC alone must not
 * be enough to fetch them: MACs leak over LAN (ARP, LLDP, switch tables) and
 * are semi-guessable. The handset therefore presents a per-device secret that
 * the admin hands out in the provisioning URL.
 *
 * The secret is random and stored encrypted at rest (like trunks.secretEnc),
 * so it is not derivable from anything an attacker can observe — the MAC, the
 * device id, or the deployment's encryption key. It is compared in constant
 * time, and a wrong or missing secret is answered exactly like an unknown MAC
 * so the endpoint does not reveal which MACs are registered.
 */

const SECRET_LENGTH = 24;

/**
 * The device's provisioning secret, creating one on first use. Stable across
 * calls, so the provisioning URL an admin already handed to a phone keeps
 * working.
 */
export async function ensureProvisionSecret(deviceId: string): Promise<string> {
  const [dev] = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (dev?.provisionSecretEnc) {
    try {
      const plain = decrypt(dev.provisionSecretEnc);
      if (plain) return plain;
    } catch {
      /* unreadable — regenerate below */
    }
  }
  const secret = randomSecret(SECRET_LENGTH);
  await db
    .update(devices)
    .set({ provisionSecretEnc: encrypt(secret) })
    .where(eq(devices.id, deviceId));
  return secret;
}

/**
 * Constant-time check of the secret presented by the handset. The presented
 * value is `unknown` because a repeated query parameter arrives as an array.
 */
export function verifyProvisionSecret(
  storedEnc: string | null | undefined,
  presented: unknown,
): boolean {
  if (typeof presented !== "string" || !presented) return false;
  if (!storedEnc) return false;
  let expected: string;
  try {
    expected = decrypt(storedEnc);
  } catch {
    return false;
  }
  if (!expected) return false;
  return safeEqual(presented, expected);
}
