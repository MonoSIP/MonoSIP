import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import {
  buildApp,
  cleanupCredentials,
  closeDb,
  seedCredentials,
  type Credentials,
} from "../test/helpers.js";
import { clearLoginFailures } from "../lib/login-guard.js";
import { db } from "../db/client.js";
import { admins, sessions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { scryptHash } from "../lib/crypto.js";

/**
 * Login / logout / TOTP-challenge contract for routes/auth.ts.
 *
 * The login guard keeps in-memory failure counters per IP and bans after
 * `securityLoginMaxRetry`. Every inject request arrives from 127.0.0.1, so the
 * counter is reset between tests to stop one negative case from cascading into
 * a 429 for the rest of the file.
 */

const TEST_IP = "127.0.0.1";

let app: FastifyInstance;
let creds: Credentials;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  clearLoginFailures(TEST_IP);
  creds = await seedCredentials();
});

afterEach(async () => {
  clearLoginFailures(TEST_IP);
  await cleanupCredentials(creds);
});

const ADMIN_LOGIN = "/api/v1/admin/auth/login";
const PORTAL_LOGIN = "/api/v1/auth/login";

/** Pull the monosip_session cookie out of a Set-Cookie header. */
function sessionCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  const hit = list.find((c) => c.startsWith("monosip_session="));
  return hit?.split(";")[0];
}

describe("admin login", () => {
  it("accepts correct credentials and sets a session cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      payload: { email: creds.adminEmail, password: creds.adminPassword },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(sessionCookie(res)).toBeDefined();
  });

  it("rejects a wrong password with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      payload: { email: creds.adminEmail, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("rejects an unknown email with the same generic error", async () => {
    const res = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      payload: { email: "nobody@test.local", password: creds.adminPassword },
    });
    expect(res.statusCode).toBe(401);
    // No user enumeration: unknown user and wrong password are indistinguishable.
    expect(res.json()).toEqual({ error: "Invalid credentials" });
  });

  it("rejects a malformed body with 400", async () => {
    const res = await app.inject({ method: "POST", url: ADMIN_LOGIN, payload: { email: 5 } });
    expect(res.statusCode).toBe(400);
  });
});

describe("admin TOTP challenge", () => {
  const secret = "JBSWY3DPEHPK3PXP";

  beforeEach(async () => {
    // Re-seed with TOTP switched on for this describe block.
    await cleanupCredentials(creds);
    creds = await seedCredentials({ totpEnabled: true, totpSecret: secret });
  });

  it("returns 401 with needTotp when the code is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      payload: { email: creds.adminEmail, password: creds.adminPassword },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ needTotp: true });
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("rejects a wrong TOTP code even with the right password", async () => {
    const res = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      payload: {
        email: creds.adminEmail,
        password: creds.adminPassword,
        totpCode: "000000",
      },
    });
    expect(res.statusCode).toBe(401);
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("accepts a valid TOTP code and issues a session", async () => {
    const res = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      payload: {
        email: creds.adminEmail,
        password: creds.adminPassword,
        totpCode: authenticator.generate(secret),
      },
    });
    expect(res.statusCode).toBe(200);
    expect(sessionCookie(res)).toBeDefined();
  });

  it("does not skip TOTP when the password is wrong", async () => {
    const res = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      payload: {
        email: creds.adminEmail,
        password: "wrong-password",
        totpCode: authenticator.generate(secret),
      },
    });
    expect(res.statusCode).toBe(401);
    // A valid code must not mask a bad password.
    expect(res.json()).toEqual({ error: "Invalid credentials" });
  });
});

describe("admin password change", () => {
  const url = "/api/v1/admin/auth/password";

  it("POST /password -> 401 without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url,
      payload: { currentPassword: creds.adminPassword, newPassword: "Admin-new-99" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a portal session", async () => {
    const login = await app.inject({
      method: "POST",
      url: PORTAL_LOGIN,
      payload: { extension: creds.extensionNumber, password: creds.extensionPassword },
    });
    const token = decodeURIComponent(sessionCookie(login)!.split("=")[1]!);
    const res = await app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: creds.extensionPassword, newPassword: "Admin-new-99" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a wrong current password and keeps the old one", async () => {
    const token = await loginAdminSession();
    const res = await app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: "not-the-password", newPassword: "Admin-new-99" },
    });
    expect(res.statusCode).toBe(401);
    const again = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      payload: { email: creds.adminEmail, password: creds.adminPassword },
    });
    expect(again.statusCode).toBe(200);
  });

  it("rejects a new password shorter than 8 characters", async () => {
    const token = await loginAdminSession();
    const res = await app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: creds.adminPassword, newPassword: "short" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("replaces the password, keeps this session, and drops the other one", async () => {
    const current = await loginAdminSession();
    const other = await loginAdminSession();
    const next = "Admin-new-99";
    const res = await app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${current}` },
      payload: { currentPassword: creds.adminPassword, newPassword: next },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const still = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${current}` },
    });
    expect(still.statusCode).toBe(200);

    const dropped = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${other}` },
    });
    expect(dropped.statusCode).toBe(401);

    const oldLogin = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      payload: { email: creds.adminEmail, password: creds.adminPassword },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      payload: { email: creds.adminEmail, password: next },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it("changes the sign-in email and keeps the password", async () => {
    const token = await loginAdminSession();
    const next = `moved-${creds.adminId.slice(0, 8)}@test.local`;
    const res = await app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: creds.adminPassword, email: next },
    });
    expect(res.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ actor: { email: next } });

    const oldLogin = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      payload: { email: creds.adminEmail, password: creds.adminPassword },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      payload: { email: next.toUpperCase(), password: creds.adminPassword },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it("rejects an email another admin already uses", async () => {
    const taken = `taken-${creds.adminId.slice(0, 8)}@test.local`;
    const [row] = await db
      .insert(admins)
      .values({ email: taken, passwordHash: scryptHash("other-admin-pw") })
      .returning();
    try {
      const token = await loginAdminSession();
      const res = await app.inject({
        method: "POST",
        url,
        headers: { authorization: `Bearer ${token}` },
        payload: { currentPassword: creds.adminPassword, email: taken },
      });
      expect(res.statusCode).toBe(409);
    } finally {
      await db.delete(admins).where(eq(admins.id, row!.id));
    }
  });
});

describe("TOTP management endpoints", () => {
  const totpRoutes: Array<[string, string]> = [
    ["POST", "/api/v1/admin/auth/totp/setup"],
    ["POST", "/api/v1/admin/auth/totp/enable"],
    ["POST", "/api/v1/admin/auth/totp/disable"],
    ["GET", "/api/v1/admin/auth/totp/status"],
  ];

  it.each(totpRoutes)("%s %s -> 401 without a token", async (method, url) => {
    const res = await app.inject({ method: method as "GET", url, payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it("GET /totp/status reports enabled for a TOTP admin", async () => {
    const token = await loginAdminSession();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/auth/totp/status",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("POST /totp/enable rejects an invalid code with 400", async () => {
    const token = await loginAdminSession();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/auth/totp/enable",
      headers: { authorization: `Bearer ${token}` },
      payload: { code: "123456" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("portal login", () => {
  it("accepts correct extension credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: PORTAL_LOGIN,
      payload: { extension: creds.extensionNumber, password: creds.extensionPassword },
    });
    expect(res.statusCode).toBe(200);
    expect(sessionCookie(res)).toBeDefined();
  });

  it("rejects a wrong password with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: PORTAL_LOGIN,
      payload: { extension: creds.extensionNumber, password: "nope" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a portal login that supplies admin credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: PORTAL_LOGIN,
      payload: { extension: creds.adminEmail, password: creds.adminPassword },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("logout and /me", () => {
  it("logout destroys the session server-side", async () => {
    const login = await app.inject({
      method: "POST",
      url: PORTAL_LOGIN,
      payload: { extension: creds.extensionNumber, password: creds.extensionPassword },
    });
    const cookie = sessionCookie(login);
    expect(cookie).toBeDefined();
    const token = decodeURIComponent(cookie!.split("=")[1]!);

    const out = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { cookie: cookie! },
    });
    expect(out.statusCode).toBe(200);

    const [row] = await db.select().from(sessions).where(eq(sessions.token, token));
    expect(row).toBeUndefined();
  });

  it("GET /api/v1/auth/me -> 401 without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/v1/auth/me resolves an admin session", async () => {
    const token = await loginAdminSession();
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { actor: { type: string; email: string } };
    expect(body.actor.type).toBe("admin");
    expect(body.actor.email).toBe(creds.adminEmail);
  });

  it("GET /api/v1/auth/me rejects a destroyed session", async () => {
    const token = await loginAdminSession();
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

/** Log in the seeded admin and return its raw session token. */
async function loginAdminSession(): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: ADMIN_LOGIN,
    payload: { email: creds.adminEmail, password: creds.adminPassword },
  });
  const cookie = sessionCookie(res);
  if (!cookie) throw new Error(`admin login failed: ${res.statusCode} ${res.body}`);
  return decodeURIComponent(cookie.split("=")[1]!);
}