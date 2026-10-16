import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  auth,
  buildApp,
  cleanupActors,
  closeDb,
  seedActors,
  type Fixtures,
} from "../test/helpers.js";
import { db } from "../db/client.js";
import { extensions } from "../db/schema.js";

/**
 * Authorization contract for the admin extension-management routes: every one
 * of them is admin-only, must not accept an extension session, and must never
 * echo stored secrets back to the caller.
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

const adminExtensionRoutes: Array<[string, string]> = [
  ["GET", "/api/v1/admin/extensions"],
  ["POST", "/api/v1/admin/extensions"],
  ["GET", "/api/v1/admin/extensions/00000000-0000-0000-0000-000000000000"],
  ["PATCH", "/api/v1/admin/extensions/00000000-0000-0000-0000-000000000000"],
  ["DELETE", "/api/v1/admin/extensions/00000000-0000-0000-0000-000000000000"],
  ["GET", "/api/v1/admin/extensions/export"],
];

describe("admin extension routes reject unauthenticated callers", () => {
  it.each(adminExtensionRoutes)("%s %s -> 401 without a token", async (method, url) => {
    const res = await app.inject({ method: method as "GET", url, payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it.each(adminExtensionRoutes)("%s %s -> 401 for an extension session", async (method, url) => {
    const res = await app.inject({
      method: method as "GET",
      url,
      payload: {},
      headers: auth(fx.extensionToken),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("admin extension routes admit a live admin session", () => {
  it("GET /extensions lists extensions without secrets", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/extensions",
      headers: auth(fx.adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    for (const row of body) {
      expect(row.sipSecretEnc).toBeUndefined();
      expect(row.portalPasswordHash).toBeUndefined();
    }
  });

  it("GET /extensions/:id returns 404 for an unknown id, not 500", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/extensions/00000000-0000-0000-0000-000000000000",
      headers: auth(fx.adminToken),
    });
    expect(res.statusCode).toBe(404);
  });

  it("POST then DELETE round-trips an extension", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/extensions",
      headers: auth(fx.adminToken),
      payload: { number: "18877", name: "Round Trip" },
    });
    expect(created.statusCode).toBe(200);
    const id = (created.json() as { id: string }).id;
    expect(typeof id).toBe("string");

    // The response carries the generated portal password once, but never the hash.
    expect((created.json() as { portalPassword: string }).portalPassword).toBeTruthy();
    expect((created.json() as Record<string, unknown>).portalPasswordHash).toBeUndefined();
    expect((created.json() as Record<string, unknown>).sipSecretEnc).toBeUndefined();

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/extensions/${id}`,
      headers: auth(fx.adminToken),
    });
    expect(deleted.statusCode).toBe(200);

    const [gone] = await db.select().from(extensions).where(eq(extensions.id, id));
    expect(gone).toBeUndefined();
  });

  it("GET /extensions/:id strips stored secrets", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/extensions/${fx.extensionId}`,
      headers: auth(fx.adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.id).toBe(fx.extensionId);
    expect(body.sipSecretEnc).toBeUndefined();
    expect(body.portalPasswordHash).toBeUndefined();
  });

  it("POST /extensions validates the body for an admin", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/extensions",
      headers: auth(fx.adminToken),
      payload: { name: "no number" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST /extensions/:id/reset-password requires admin", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/extensions/${fx.extensionId}/reset-password`,
      headers: auth(fx.extensionToken),
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it("PUT /extensions/:id/spend-limit requires admin", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/admin/extensions/${fx.extensionId}/spend-limit`,
      headers: auth(fx.extensionToken),
      payload: { dailyLimitMinutes: 10, monthlyLimitMinutes: 100 },
    });
    expect(res.statusCode).toBe(401);
  });
});