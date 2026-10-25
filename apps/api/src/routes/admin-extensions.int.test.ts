import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import {
  auth,
  buildApp,
  cleanupActors,
  closeDb,
  seedActors,
  type Fixtures,
} from "../test/helpers.js";
import { db } from "../db/client.js";
import { auditLog, extensions } from "../db/schema.js";
import { decrypt, scryptVerify } from "../lib/crypto.js";

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
describe("one extension password for portal and SIP", () => {
  const call = (method: "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
    app.inject({ method, url, headers: auth(fx.adminToken), payload: payload as never });
  const load = async (id: string) => (await db.select().from(extensions).where(eq(extensions.id, id)))[0]!;

  it("uses an admin-chosen password for both the portal and SIP", async () => {
    const res = await call("POST", "/api/v1/admin/extensions", { number: "18878", name: "Manual", portalPassword: "Desk-2026!x" });
    expect(res.statusCode).toBe(200);
    const id = (res.json() as { id: string }).id;
    try {
      let row = await load(id);
      expect(scryptVerify("Desk-2026!x", row.portalPasswordHash)).toBe(true);
      expect(decrypt(row.sipSecretEnc)).toBe("Desk-2026!x");

      // changing it changes both
      expect((await call("PATCH", `/api/v1/admin/extensions/${id}`, { portalPassword: "Yeni-Sifre42" })).statusCode).toBe(200);
      row = await load(id);
      expect(scryptVerify("Yeni-Sifre42", row.portalPasswordHash)).toBe(true);
      expect(decrypt(row.sipSecretEnc)).toBe("Yeni-Sifre42");

      // the password never reaches the audit log
      const audits = await db.select().from(auditLog).where(eq(auditLog.objectId, id));
      expect(JSON.stringify(audits)).not.toContain("Yeni-Sifre42");

      // reset generates one password for both
      const reset = await call("POST", `/api/v1/admin/extensions/${id}/reset-password`);
      const pw = (reset.json() as { portalPassword: string }).portalPassword;
      row = await load(id);
      expect(scryptVerify(pw, row.portalPasswordHash)).toBe(true);
      expect(decrypt(row.sipSecretEnc)).toBe(pw);
    } finally {
      await call("DELETE", `/api/v1/admin/extensions/${id}`);
    }
  });

  it("generates one password for both when none is given", async () => {
    const res = await call("POST", "/api/v1/admin/extensions", { number: "18879", name: "Generated" });
    const { id, portalPassword } = res.json() as { id: string; portalPassword: string };
    try {
      const row = await load(id);
      expect(decrypt(row.sipSecretEnc)).toBe(portalPassword);
      expect(scryptVerify(portalPassword, row.portalPasswordHash)).toBe(true);
    } finally {
      await call("DELETE", `/api/v1/admin/extensions/${id}`);
    }
  });

  it("rejects passwords that would break pjsip.conf or are too short", async () => {
    for (const bad of ["short1", "has;semicolon", 'quote"d-pass', "with space 1", "back\\slash1"]) {
      const res = await call("POST", "/api/v1/admin/extensions", { number: "18880", name: "Bad", portalPassword: bad });
      expect(res.statusCode, bad).toBe(400);
    }
  });
});

describe("CSV import credentials", () => {
  const importCsv = (csv: string) =>
    app.inject({
      method: "POST",
      url: "/api/v1/admin/extensions/import",
      headers: auth(fx.adminToken),
      payload: { csv },
    });

  it("gives an imported extension an unguessable password instead of portal<number>", async () => {
    const number = "18890";
    const res = await importCsv(`number,name,email,dnd,portalEnabled\n${number},Imported,,false,false`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      created: number;
      credentials: Array<{ number: string; portalPassword: string }>;
    };
    expect(body.created).toBe(1);

    const [row] = await db.select().from(extensions).where(eq(extensions.number, number));
    try {
      // The password must not be derivable from the extension number.
      expect(scryptVerify(`portal${number}`, row.portalPasswordHash)).toBe(false);
      // It is one password for both the portal login and the SIP registration.
      const issued = body.credentials.find((c) => c.number === number);
      expect(issued).toBeDefined();
      expect(scryptVerify(issued!.portalPassword, row.portalPasswordHash)).toBe(true);
      expect(decrypt(row.sipSecretEnc)).toBe(issued!.portalPassword);
    } finally {
      await db.delete(extensions).where(eq(extensions.number, number));
    }
  });

  it("issues a distinct password per imported extension", async () => {
    const res = await importCsv("number,name\n18891,A\n18892,B");
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      credentials: Array<{ number: string; portalPassword: string }>;
    };
    try {
      const passwords = body.credentials.map((c) => c.portalPassword);
      expect(passwords).toHaveLength(2);
      expect(new Set(passwords).size).toBe(2);
    } finally {
      await db.delete(extensions).where(inArray(extensions.number, ["18891", "18892"]));
    }
  });

  it("does not change the password of an extension that already exists", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/extensions",
      headers: auth(fx.adminToken),
      payload: { number: "18893", name: "Existing" },
    });
    const id = (created.json() as { id: string }).id;
    const before = (created.json() as { portalPassword: string }).portalPassword;
    try {
      const res = await importCsv("number,name\n18893,Renamed");
      expect(res.statusCode).toBe(200);
      const body = res.json() as { updated: number; credentials: unknown[] };
      expect(body.updated).toBe(1);
      expect(body.credentials).toHaveLength(0);

      const [row] = await db.select().from(extensions).where(eq(extensions.number, "18893"));
      expect(scryptVerify(before, row.portalPasswordHash)).toBe(true);
      expect(row.name).toBe("Renamed");
    } finally {
      await app.inject({
        method: "DELETE",
        url: `/api/v1/admin/extensions/${id}`,
        headers: auth(fx.adminToken),
      });
    }
  });
});
