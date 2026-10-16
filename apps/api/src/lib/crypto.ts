import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { config } from "../config.js";

const ALGO = "aes-256-gcm";

function keyBytes(): Buffer {
  return Buffer.from(config.encryptionKey.slice(0, 64), "hex");
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Invalid ciphertext");
  const decipher = createDecipheriv(ALGO, keyBytes(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function randomSecret(length = 32): string {
  return randomBytes(length).toString("base64url").slice(0, length);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function deriveSipPassword(): string {
  return randomBytes(24).toString("base64url");
}

export function hmacSign(secret: string, body: string): string {
  // Real HMAC: a raw sha256(secret + body) concat is vulnerable to length-extension
  // forgery once the signature for one body is observed.
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function scryptHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function scryptVerify(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  // timingSafeEqual throws on length mismatch, and a plain === leaks a timing
  // signal, so guard the length first and compare in constant time.
  if (expected.length !== check.length) return false;
  return timingSafeEqual(check, expected);
}
