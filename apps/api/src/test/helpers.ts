import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { admins, extensions, sessions } from "../db/schema.js";
import { scryptHash } from "../lib/crypto.js";
import { enforceAdminIpAccess } from "../lib/admin-ip-guard.js";
import { authRoutes } from "../routes/auth.js";
import { portalRoutes } from "../routes/portal.js";
import { securityRoutes } from "../routes/security.js";
import { adminExtensionRoutes } from "../routes/admin-extensions.js";
import { adminResourceRoutes } from "../routes/admin-resources.js";

/**
 * Builds a Fastify instance wired exactly like `src/index.ts` does for the
 * routes under test (cookie plugin + the admin IP guard onRequest hook), minus
 * Asterisk ARI/AMI connections and the background jobs, which have no place in
 * an integration test.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie, { secret: "integration-test-secret-not-used-in-prod" });
  // Mirrors index.ts — required by the prompt / MOH multipart upload routes.
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

  app.addHook("onRequest", async (req, reply) => {
    await enforceAdminIpAccess(req, reply);
  });

  await authRoutes(app);
  await securityRoutes(app);
  await portalRoutes(app);
  await adminExtensionRoutes(app);
  await adminResourceRoutes(app);

  app.setErrorHandler((err, _req, reply) => {
    const error = err as Error & { name?: string };
    if (error.name === "ZodError") {
      return reply.code(400).send({ error: "Validation failed" });
    }
    return reply.code(500).send({ error: error.message ?? "Internal error" });
  });

  return app;
}

export type Fixtures = {
  adminId: string;
  extensionId: string;
  adminToken: string;
  extensionToken: string;
};

export type Credentials = {
  adminId: string;
  adminEmail: string;
  adminPassword: string;
  extensionId: string;
  extensionNumber: string;
  extensionPassword: string;
};

/** Seed an admin + extension with known passwords, for login-flow tests. */
export async function seedCredentials(opts: { totpEnabled?: boolean; totpSecret?: string } = {}): Promise<Credentials> {
  const adminEmail = `login-${uniq()}@test.local`;
  const extensionNumber = `7${String(Date.now()).slice(-6)}${seq++}`.slice(0, 16);

  const [admin] = await db
    .insert(admins)
    .values({
      email: adminEmail,
      passwordHash: scryptHash("admin-pw"),
      totpEnabled: opts.totpEnabled ?? false,
      totpSecret: opts.totpSecret ?? null,
    })
    .returning();

  const [ext] = await db
    .insert(extensions)
    .values({
      number: extensionNumber,
      name: "Login Extension",
      sipSecretEnc: "enc",
      portalEnabled: true,
      portalPasswordHash: scryptHash("ext-pw"),
    })
    .returning();

  return {
    adminId: admin.id,
    adminEmail,
    adminPassword: "admin-pw",
    extensionId: ext.id,
    extensionNumber,
    extensionPassword: "ext-pw",
  };
}

export async function cleanupCredentials(c: Credentials): Promise<void> {
  await db.delete(sessions).where(inArray(sessions.actorId, [c.adminId, c.extensionId]));
  await db.delete(extensions).where(eq(extensions.id, c.extensionId));
  await db.delete(admins).where(eq(admins.id, c.adminId));
}

let seq = 0;
/** Unique per call so repeated runs never collide on unique columns. */
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Inserts an admin, an extension, and a live session for each. */
export async function seedActors(): Promise<Fixtures> {
  const [admin] = await db
    .insert(admins)
    .values({
      email: `admin-${uniq()}@test.local`,
      passwordHash: scryptHash("admin-pw"),
      totpEnabled: false,
    })
    .returning();

  const [ext] = await db
    .insert(extensions)
    .values({
      number: `9${String(Date.now()).slice(-5)}${seq++}`.slice(0, 16),
      name: "Test Extension",
      sipSecretEnc: "enc",
      portalEnabled: true,
      portalPasswordHash: scryptHash("ext-pw"),
    })
    .returning();

  const adminToken = `tok-admin-${uniq()}`;
  const extensionToken = `tok-ext-${uniq()}`;
  const expiresAt = new Date(Date.now() + 3600_000);

  await db.insert(sessions).values([
    { token: adminToken, actorType: "admin", actorId: admin.id, expiresAt },
    { token: extensionToken, actorType: "extension", actorId: ext.id, expiresAt },
  ]);

  return {
    adminId: admin.id,
    extensionId: ext.id,
    adminToken,
    extensionToken,
  };
}

/** Removes the actors and their sessions created by seedActors. */
export async function cleanupActors(fx: Fixtures): Promise<void> {
  await db.delete(sessions).where(inArray(sessions.actorId, [fx.adminId, fx.extensionId]));
  await db.delete(extensions).where(eq(extensions.id, fx.extensionId));
  await db.delete(admins).where(eq(admins.id, fx.adminId));
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

/** Bearer header helper. */
export const auth = (token: string) => ({ authorization: `Bearer ${token}` });