import { eq, and, gt } from "drizzle-orm";
import type { FastifyRequest, FastifyReply } from "fastify";
import { db } from "../db/client.js";
import { sessions, admins, extensions } from "../db/schema.js";
import { randomSecret, scryptVerify } from "./crypto.js";
import { authenticator } from "otplib";

export type Actor =
  | { type: "admin"; id: string; email: string }
  | { type: "extension"; id: string; number: string; name: string };

const COOKIE = "dsip_session";

export async function createSession(
  actorType: "admin" | "extension",
  actorId: string,
  days = 7,
): Promise<string> {
  const token = randomSecret(48);
  const expiresAt = new Date(Date.now() + days * 86400_000);
  await db.insert(sessions).values({ token, actorType, actorId, expiresAt });
  return token;
}

export async function destroySession(token: string) {
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function resolveActor(token?: string): Promise<Actor | null> {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;

  if (row.actorType === "admin") {
    const [admin] = await db.select().from(admins).where(eq(admins.id, row.actorId)).limit(1);
    if (!admin) return null;
    return { type: "admin", id: admin.id, email: admin.email };
  }

  const [ext] = await db
    .select()
    .from(extensions)
    .where(eq(extensions.id, row.actorId))
    .limit(1);
  if (!ext) return null;
  return { type: "extension", id: ext.id, number: ext.number, name: ext.name };
}

export function getSessionToken(req: FastifyRequest): string | undefined {
  const raw = req.cookies?.[COOKIE];
  if (raw) return raw;
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return undefined;
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const actor = await resolveActor(getSessionToken(req));
  if (!actor || actor.type !== "admin") {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  return actor;
}

export async function requireExtension(req: FastifyRequest, reply: FastifyReply) {
  const actor = await resolveActor(getSessionToken(req));
  if (!actor || actor.type !== "extension") {
    return reply.code(401).send({ error: "Unauthorized" });
  }
  return actor;
}

export async function loginAdmin(
  email: string,
  password: string,
  totpCode?: string,
): Promise<{ token: string } | { error: string; needTotp?: boolean }> {
  const [admin] = await db.select().from(admins).where(eq(admins.email, email)).limit(1);
  if (!admin || !scryptVerify(password, admin.passwordHash)) {
    return { error: "Invalid credentials" };
  }
  if (admin.totpEnabled) {
    if (!totpCode || !admin.totpSecret || !authenticator.check(totpCode, admin.totpSecret)) {
      return { error: "TOTP required", needTotp: true };
    }
  }
  const token = await createSession("admin", admin.id);
  return { token };
}

export async function loginExtension(
  number: string,
  password: string,
): Promise<{ token: string } | { error: string }> {
  const [ext] = await db.select().from(extensions).where(eq(extensions.number, number)).limit(1);
  if (!ext || !ext.portalEnabled || !ext.portalPasswordHash) {
    return { error: "Invalid credentials" };
  }
  if (!scryptVerify(password, ext.portalPasswordHash)) {
    return { error: "Invalid credentials" };
  }
  const token = await createSession("extension", ext.id);
  return { token };
}

export { COOKIE };
