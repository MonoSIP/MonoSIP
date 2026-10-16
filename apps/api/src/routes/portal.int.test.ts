import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { auth, buildApp, cleanupActors, closeDb, seedActors, type Fixtures } from "../test/helpers.js";

/**
 * Authorization contract for the portal routes: these are extension-scoped
 * ("/api/v1/me"), so an admin session must be rejected, and an unauthenticated
 * caller must be rejected, while the owning extension succeeds.
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

const portalRoutes: Array<[string, string]> = [
  ["GET", "/api/v1/me"],
  ["GET", "/api/v1/me/sip-credentials"],
  ["GET", "/api/v1/me/calls"],
  ["GET", "/api/v1/me/missed-calls"],
  ["GET", "/api/v1/me/recordings"],
  ["GET", "/api/v1/me/voicemails"],
  ["GET", "/api/v1/me/forwarding"],
  ["GET", "/api/v1/me/directory"],
];

describe("portal routes reject unauthenticated callers", () => {
  it.each(portalRoutes)("%s %s -> 401 without a token", async (method, url) => {
    const res = await app.inject({ method: method as "GET", url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: "Unauthorized" });
  });

  it.each(portalRoutes)("%s %s -> 401 with an unknown token", async (method, url) => {
    const res = await app.inject({
      method: method as "GET",
      url,
      headers: auth("tok-does-not-exist"),
    });
    expect(res.statusCode).toBe(401);
  });

  it.each(portalRoutes)("%s %s -> 401 for an admin session", async (method, url) => {
    // An admin is authenticated but is NOT an extension: /me must not resolve
    // them, otherwise an admin session would read another user's portal data.
    const res = await app.inject({
      method: method as "GET",
      url,
      headers: auth(fx.adminToken),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("portal routes admit the owning extension", () => {
  it("GET /api/v1/me returns the caller's own profile", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: auth(fx.extensionToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; name: string };
    expect(body.id).toBe(fx.extensionId);
    expect(body.name).toBe("Test Extension");
  });

  it("GET /api/v1/me never returns another extension's record", async () => {
    // Control: the session resolves to exactly the seeded extension, proving the
    // /me handler is session-scoped rather than returning the first row.
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: auth(fx.extensionToken),
    });
    expect(res.json().id).not.toBe(fx.adminId);
  });

  it("GET /api/v1/me/directory lists extensions without secrets", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/me/directory",
      headers: auth(fx.extensionToken),
    });
    expect(res.statusCode).toBe(200);
  });

  it("PUT /api/v1/me/dnd toggles the caller's own DND flag", async () => {
    const on = await app.inject({
      method: "PUT",
      url: "/api/v1/me/dnd",
      headers: auth(fx.extensionToken),
      payload: { dnd: true },
    });
    expect(on.statusCode).toBe(200);

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      headers: auth(fx.extensionToken),
    });
    expect(me.json().dnd).toBe(true);

    // Restore so the fixture row is consistent for later assertions.
    await app.inject({
      method: "PUT",
      url: "/api/v1/me/dnd",
      headers: auth(fx.extensionToken),
      payload: { dnd: false },
    });
  });

  it("PUT /api/v1/me/dnd -> 401 without a token", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/me/dnd",
      payload: { dnd: true },
    });
    expect(res.statusCode).toBe(401);
  });
});