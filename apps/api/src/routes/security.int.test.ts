import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { auth, buildApp, cleanupActors, closeDb, seedActors, type Fixtures } from "../test/helpers.js";

/**
 * Authorization contract for the admin security routes: only a live admin
 * session may reach them. No token, an expired token, an unknown token and an
 * *extension* token must all be rejected with 401.
 */

let app: FastifyInstance;
let fx: Fixtures;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closeDb();
});

beforeEach(async () => {
  fx = await seedActors();
});

afterEach(async () => {
  await cleanupActors(fx);
});

const adminRoutes: Array<[string, string, object?]> = [
  ["GET", "/api/v1/admin/security/bans"],
  ["GET", "/api/v1/admin/security/status"],
  ["GET", "/api/v1/admin/security/firewall-export"],
  ["POST", "/api/v1/admin/security/bans", { ip: "203.0.113.9", reason: "test" }],
];

describe("admin security routes reject unauthenticated callers", () => {
  it.each(adminRoutes)("%s %s -> 401 without a token", async (method, url, payload) => {
    const res = await app.inject({ method: method as "GET", url, payload });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "Unauthorized" });
  });

  it.each(adminRoutes)("%s %s -> 401 with an unknown token", async (method, url, payload) => {
    const res = await app.inject({
      method: method as "GET",
      url,
      payload,
      headers: auth("tok-does-not-exist"),
    });
    expect(res.statusCode).toBe(401);
  });

  it.each(adminRoutes)("%s %s -> 401 for an extension session", async (method, url, payload) => {
    // Privilege separation: an authenticated extension must not reach admin APIs.
    const res = await app.inject({
      method: method as "GET",
      url,
      payload,
      headers: auth(fx.extensionToken),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "Unauthorized" });
  });
});

describe("admin security routes admit a live admin session", () => {
  it("GET /bans returns the ban list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/security/bans",
      headers: auth(fx.adminToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("bans");
  });

  it("POST /bans creates a ban and DELETE /bans/:id removes it", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/security/bans",
      headers: auth(fx.adminToken),
      payload: { ip: "198.51.100.7", reason: "integration test", expiresMinutes: 5 },
    });
    expect(created.statusCode).toBe(200);

    const id = (created.json() as { id?: string }).id;
    expect(typeof id).toBe("string");

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/security/bans/${id}`,
      headers: auth(fx.adminToken),
    });
    expect(deleted.statusCode).toBe(200);
  });

  it("POST /bans validates the body even for an admin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/security/bans",
      headers: auth(fx.adminToken),
      payload: { ip: "x" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("internal hook authentication", () => {
  it("POST /api/v1/internal/security/ban -> 401 without the internal secret", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/security/ban",
      payload: { ip: "203.0.113.11" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/internal/security/ban -> 401 with a wrong secret", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/security/ban",
      headers: { "x-monosip-internal": "wrong-secret" },
      payload: { ip: "203.0.113.12" },
    });
    expect(res.statusCode).toBe(401);
  });
});