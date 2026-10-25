import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  buildApp,
  cleanupCredentials,
  closeDb,
  seedCredentials,
  type Credentials,
} from "../test/helpers.js";
import { restoreSettings, setSettings, snapshotSettings } from "../test/jobs-harness.js";
import { clearLoginFailures } from "../lib/login-guard.js";
import { db } from "../db/client.js";
import { ipBans } from "../db/schema.js";

/**
 * X-Forwarded-For must not let a client choose the address the login guard
 * counts failures against.
 *
 * The guard keys the per-IP failure counter and the ban on `req.ip`, and
 * `adminIpAllowlist` decides whether a caller may reach the admin panel at
 * all. Both must reflect the real peer, never a header the client wrote.
 *
 * nginx forwards `X-Forwarded-For: <client header>, $remote_addr`, so the
 * right-most entry is what the proxy itself observed. Everything to the left
 * of it was supplied by the client and must not be believed.
 */

/** The nginx container, on the Compose `monosip` bridge network. */
const PROXY = "172.18.0.5";
/** A direct client that reaches the API without a proxy in front. */
const ATTACKER = "198.51.100.7";
/** The admin's own address — the one an attacker wants to frame. */
const VICTIM = "203.0.113.50";

const ADMIN_LOGIN = "/api/v1/admin/auth/login";
const PORTAL_LOGIN = "/api/v1/auth/login";

/** Only the bridge network is trusted, so ATTACKER and VICTIM are direct peers. */
const TRUSTED = ["172.16.0.0/12"];

let app: FastifyInstance;
let creds: Credentials;
let settingsSnapshot: unknown;

beforeAll(async () => {
  app = await buildApp({ trustedProxyCidrs: TRUSTED });
  await app.ready();
  settingsSnapshot = await snapshotSettings();
});

afterAll(async () => {
  await app.close();
  await restoreSettings(settingsSnapshot);
  await closeDb();
});

beforeEach(async () => {
  creds = await seedCredentials();
  clearLoginFailures(ATTACKER);
  clearLoginFailures(VICTIM);
  clearLoginFailures(PROXY);
});

afterEach(async () => {
  clearLoginFailures(ATTACKER);
  clearLoginFailures(VICTIM);
  clearLoginFailures(PROXY);
  // ip_bans is a shared table: leave no row behind for another suite.
  await db.delete(ipBans).where(eq(ipBans.ip, ATTACKER));
  await db.delete(ipBans).where(eq(ipBans.ip, VICTIM));
  await cleanupCredentials(creds);
});

/** Failed portal logins from the attacker, each carrying the given header. */
async function failedPortalLogins(headerValue: string, times: number) {
  const responses = [];
  for (let i = 0; i < times; i++) {
    responses.push(
      await app.inject({
        method: "POST",
        url: PORTAL_LOGIN,
        remoteAddress: ATTACKER,
        headers: { "x-forwarded-for": headerValue },
        payload: { extension: creds.extensionNumber, password: "wrong-password" },
      }),
    );
  }
  return responses;
}

describe("X-Forwarded-For cannot evade the login guard", () => {
  it("counts a rotating header against the real peer, not against each spoofed value", async () => {
    await setSettings({ securityLoginMaxRetry: 3, securityLoginBanMinutes: 15 });

    // Each attempt claims a different source address.
    const first = await failedPortalLogins(`${VICTIM}, ${ATTACKER}`, 1);
    expect(first[0]!.statusCode).toBe(401);

    const second = await failedPortalLogins("198.51.100.99", 1);
    expect(second[0]!.statusCode).toBe(401);

    const third = await failedPortalLogins("203.0.113.77", 1);
    expect(third[0]!.statusCode).toBe(401);

    // The counter is keyed on the real peer, so the fourth attempt is banned
    // even though every request carried a different header.
    const fourth = await failedPortalLogins("192.0.2.5", 1);
    expect(fourth[0]!.statusCode).toBe(429);

    const banned = await db.select().from(ipBans).where(eq(ipBans.ip, ATTACKER));
    expect(banned).toHaveLength(1);
  });

  it("never bans an allowlisted address the attacker claims to be", async () => {
    await setSettings({
      securityLoginMaxRetry: 3,
      securityLoginBanMinutes: 15,
      adminIpAllowlist: [VICTIM],
    });

    // The attacker always claims the allowlisted admin's address.
    const responses = await failedPortalLogins(VICTIM, 4);
    expect(responses[0]!.statusCode).toBe(401);
    expect(responses[3]!.statusCode).toBe(429);

    // The ban landed on the attacker, never on the address it impersonated.
    const victimBans = await db.select().from(ipBans).where(eq(ipBans.ip, VICTIM));
    expect(victimBans).toHaveLength(0);

    const attackerBans = await db.select().from(ipBans).where(eq(ipBans.ip, ATTACKER));
    expect(attackerBans).toHaveLength(1);
  });

  it("leaves the allowlisted admin able to sign in after the attack", async () => {
    await setSettings({
      securityLoginMaxRetry: 3,
      securityLoginBanMinutes: 15,
      adminIpAllowlist: [VICTIM],
    });

    await failedPortalLogins(VICTIM, 4);

    // The admin's own session still works and is not locked out.
    const res = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      remoteAddress: VICTIM,
      payload: { email: creds.adminEmail, password: creds.adminPassword },
    });
    expect(res.statusCode).toBe(200);
  });

  it("does not let a spoofed header grant access to the admin panel", async () => {
    await setSettings({ adminIpAllowlist: [VICTIM] });

    // The attacker claims the allowlisted address; it is not believed.
    const res = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      remoteAddress: ATTACKER,
      headers: { "x-forwarded-for": VICTIM },
      payload: { email: creds.adminEmail, password: creds.adminPassword },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("a trusted proxy still determines the client address", () => {
  it("uses the right-most entry nginx appended and ignores what the client prepended", async () => {
    await setSettings({ adminIpAllowlist: [VICTIM] });

    // nginx appends the address it saw, so the client's own value sits to the
    // left of it. The right-most entry is the true client.
    const ok = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      remoteAddress: PROXY,
      headers: { "x-forwarded-for": `1.2.3.4, ${VICTIM}` },
      payload: { email: creds.adminEmail, password: creds.adminPassword },
    });
    expect(ok.statusCode).toBe(200);

    // The same address in the client-supplied slot is not believed.
    const denied = await app.inject({
      method: "POST",
      url: ADMIN_LOGIN,
      remoteAddress: PROXY,
      headers: { "x-forwarded-for": `${VICTIM}, 9.9.9.9` },
      payload: { email: creds.adminEmail, password: creds.adminPassword },
    });
    expect(denied.statusCode).toBe(403);
  });
});
