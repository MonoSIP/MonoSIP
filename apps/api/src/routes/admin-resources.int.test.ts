import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  auth,
  buildApp,
  cleanupActors,
  closeDb,
  seedActors,
  type Fixtures,
} from "../test/helpers.js";

/**
 * Authorization contract for routes/admin-resources.ts — 107 routes spanning
 * trunks, dialplan routes, queues, schedules, flows, prompts, recordings, CDR,
 * reports, secrets, API keys and audit.
 *
 * The table below is the full route surface. Every /api/v1/admin/* entry must
 * reject anonymous callers AND an authenticated *extension* session: these are
 * the operator APIs, so privilege separation is the contract under test.
 *
 * /api/v1/internal/* is guarded by the shared-secret header instead, and
 * /cfg/:mac + /api/v1/health are deliberately unauthenticated (handset
 * provisioning and liveness), so they are asserted separately.
 */

const ID = "11111111-1111-1111-1111-111111111111";

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

const ADMIN_ROUTES: Array<[string, string]> = [
["GET", "/api/v1/admin/trunks"],
["POST", "/api/v1/admin/trunks"],
["PATCH", "/api/v1/admin/trunks/11111111-1111-1111-1111-111111111111"],
["DELETE", "/api/v1/admin/trunks/11111111-1111-1111-1111-111111111111"],
["GET", "/api/v1/admin/trunks/11111111-1111-1111-1111-111111111111/status"],
["GET", "/api/v1/admin/routes/inbound"],
["POST", "/api/v1/admin/routes/inbound"],
["GET", "/api/v1/admin/routes/outbound"],
["POST", "/api/v1/admin/routes/outbound"],
["DELETE", "/api/v1/admin/routes/11111111-1111-1111-1111-111111111111/11111111-1111-1111-1111-111111111111"],
["GET", "/api/v1/admin/blacklist"],
["POST", "/api/v1/admin/blacklist"],
["DELETE", "/api/v1/admin/blacklist/11111111-1111-1111-1111-111111111111"],
["GET", "/api/v1/admin/ring-groups"],
["POST", "/api/v1/admin/ring-groups"],
["PATCH", "/api/v1/admin/ring-groups/11111111-1111-1111-1111-111111111111"],
["DELETE", "/api/v1/admin/ring-groups/11111111-1111-1111-1111-111111111111"],
["GET", "/api/v1/admin/queues"],
["POST", "/api/v1/admin/queues"],
["PATCH", "/api/v1/admin/queues/11111111-1111-1111-1111-111111111111"],
["DELETE", "/api/v1/admin/queues/11111111-1111-1111-1111-111111111111"],
["POST", "/api/v1/admin/queues/11111111-1111-1111-1111-111111111111/members/11111111-1111-1111-1111-111111111111/pause"],
["GET", "/api/v1/admin/schedules"],
["POST", "/api/v1/admin/schedules"],
["PATCH", "/api/v1/admin/schedules/11111111-1111-1111-1111-111111111111"],
["PUT", "/api/v1/admin/schedules/11111111-1111-1111-1111-111111111111/override"],
["GET", "/api/v1/admin/holidays"],
["POST", "/api/v1/admin/holidays"],
["DELETE", "/api/v1/admin/holidays/11111111-1111-1111-1111-111111111111"],
["DELETE", "/api/v1/admin/schedules/11111111-1111-1111-1111-111111111111"],
["GET", "/api/v1/admin/flows"],
["POST", "/api/v1/admin/flows"],
["PATCH", "/api/v1/admin/flows/11111111-1111-1111-1111-111111111111"],
["GET", "/api/v1/admin/flows/11111111-1111-1111-1111-111111111111/draft"],
["PUT", "/api/v1/admin/flows/11111111-1111-1111-1111-111111111111/draft"],
["POST", "/api/v1/admin/flows/11111111-1111-1111-1111-111111111111/validate"],
["POST", "/api/v1/admin/flows/11111111-1111-1111-1111-111111111111/publish"],
["GET", "/api/v1/admin/flows/11111111-1111-1111-1111-111111111111/versions"],
["POST", "/api/v1/admin/flows/11111111-1111-1111-1111-111111111111/rollback"],
["POST", "/api/v1/admin/flows/11111111-1111-1111-1111-111111111111/simulate"],
["POST", "/api/v1/admin/flows/test-http"],
["GET", "/api/v1/admin/prompts"],
["GET", "/api/v1/admin/tts/status"],
["POST", "/api/v1/admin/prompts"],
["POST", "/api/v1/admin/prompts/11111111-1111-1111-1111-111111111111/synthesize"],
["POST", "/api/v1/admin/prompts/upload"],
["POST", "/api/v1/admin/prompts/11111111-1111-1111-1111-111111111111/upload"],
["GET", "/api/v1/admin/prompts/11111111-1111-1111-1111-111111111111/stream"],
["GET", "/api/v1/admin/moh"],
["POST", "/api/v1/admin/moh"],
["POST", "/api/v1/admin/moh/11111111-1111-1111-1111-111111111111/upload"],
["GET", "/api/v1/admin/moh/11111111-1111-1111-1111-111111111111/files/11111111-1111-1111-1111-111111111111/stream"],
["DELETE", "/api/v1/admin/moh/11111111-1111-1111-1111-111111111111/files/11111111-1111-1111-1111-111111111111"],
["GET", "/api/v1/admin/cdr"],
["GET", "/api/v1/admin/cdr/export"],
["GET", "/api/v1/admin/cdr/11111111-1111-1111-1111-111111111111/timeline"],
["GET", "/api/v1/admin/recordings"],
["GET", "/api/v1/admin/recordings/11111111-1111-1111-1111-111111111111/stream"],
["GET", "/api/v1/admin/recordings/11111111-1111-1111-1111-111111111111/download"],
["GET", "/api/v1/admin/recordings/11111111-1111-1111-1111-111111111111/access-log"],
["GET", "/api/v1/admin/missed-calls"],
["PATCH", "/api/v1/admin/missed-calls/11111111-1111-1111-1111-111111111111"],
["GET", "/api/v1/admin/live/calls"],
["GET", "/api/v1/admin/schedules/11111111-1111-1111-1111-111111111111/status"],
["GET", "/api/v1/admin/reports/quality"],
["POST", "/api/v1/admin/live/calls/11111111-1111-1111-1111-111111111111/hangup"],
["POST", "/api/v1/admin/live/cleanup"],
["POST", "/api/v1/admin/live/calls/11111111-1111-1111-1111-111111111111/spy"],
["GET", "/api/v1/admin/reports/summary"],
["GET", "/api/v1/admin/reports/queues"],
["GET", "/api/v1/admin/reports/extensions"],
["GET", "/api/v1/admin/reports/ivr"],
["GET", "/api/v1/admin/settings"],
["PATCH", "/api/v1/admin/settings"],
["GET", "/api/v1/admin/secrets"],
["POST", "/api/v1/admin/secrets"],
["DELETE", "/api/v1/admin/secrets/11111111-1111-1111-1111-111111111111"],
["GET", "/api/v1/admin/webhooks"],
["POST", "/api/v1/admin/webhooks"],
["GET", "/api/v1/admin/api-keys"],
["POST", "/api/v1/admin/api-keys"],
["PATCH", "/api/v1/admin/api-keys/11111111-1111-1111-1111-111111111111"],
["DELETE", "/api/v1/admin/api-keys/11111111-1111-1111-1111-111111111111"],
["GET", "/api/v1/admin/audit-log"],
["POST", "/api/v1/admin/system/reload"],
["GET", "/api/v1/admin/backups"],
["POST", "/api/v1/admin/backups"],
["POST", "/api/v1/admin/archive/run"],
["POST", "/api/v1/admin/archive/test-sftp"],
["POST", "/api/v1/admin/backups/restore"],
["GET", "/api/v1/admin/devices"],
["POST", "/api/v1/admin/devices"],
["GET", "/api/v1/admin/devices/11111111-1111-1111-1111-111111111111/qr"],
["POST", "/api/v1/admin/holidays/import"],
["POST", "/api/v1/admin/holidays/tr-pack"],
["GET", "/api/v1/admin/flows/11111111-1111-1111-1111-111111111111/export"],
["POST", "/api/v1/admin/flows/11111111-1111-1111-1111-111111111111/import"],
["POST", "/api/v1/admin/webhooks/11111111-1111-1111-1111-111111111111/test"],
["DELETE", "/api/v1/admin/devices/11111111-1111-1111-1111-111111111111"]
];

const INTERNAL_ROUTES: Array<[string, string]> = [
["POST", "/api/v1/internal/queue-callback"],
["POST", "/api/v1/internal/cdr"],
["POST", "/api/v1/internal/recording"],
["POST", "/api/v1/internal/dnd"],
["POST", "/api/v1/internal/missed"],
["POST", "/api/v1/internal/voicemail"]
];

describe("admin resource routes reject unauthenticated callers", () => {
  it.each(ADMIN_ROUTES)("%s %s -> 401 without a token", async (method, url) => {
    const res = await app.inject({ method: method as "GET", url, payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it.each(ADMIN_ROUTES)("%s %s -> 401 for an extension session", async (method, url) => {
    const res = await app.inject({
      method: method as "GET",
      url,
      payload: {},
      headers: auth(fx.extensionToken),
    });
    expect(res.statusCode).toBe(401);
  });

  it.each(ADMIN_ROUTES)("%s %s -> 401 for an unknown token", async (method, url) => {
    const res = await app.inject({
      method: method as "GET",
      url,
      payload: {},
      headers: auth("tok-nope"),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("internal hooks require the shared secret", () => {
  it.each(INTERNAL_ROUTES)("%s %s -> 401 without the internal secret", async (method, url) => {
    const res = await app.inject({ method: method as "POST", url, payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it.each(INTERNAL_ROUTES)("%s %s -> 401 with a wrong secret", async (method, url) => {
    const res = await app.inject({
      method: method as "POST",
      url,
      payload: {},
      headers: { "x-dsip-internal": "wrong" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("an admin session does NOT satisfy the internal secret", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/cdr",
      payload: {},
      headers: auth(fx.adminToken),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("unauthenticated endpoints stay open and inert", () => {
  it("GET /api/v1/health responds without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBeLessThan(500);
  });

  it("GET /cfg/:mac 404s an unknown MAC rather than leaking config", async () => {
    const res = await app.inject({ method: "GET", url: `/cfg/${ID}` });
    expect(res.statusCode).toBe(404);
  });
});

/** Read-only admin endpoints that must answer an admin session. */
const ADMIN_READS: string[] = [
  "/api/v1/admin/trunks",
  "/api/v1/admin/routes/inbound",
  "/api/v1/admin/routes/outbound",
  "/api/v1/admin/blacklist",
  "/api/v1/admin/ring-groups",
  "/api/v1/admin/queues",
  "/api/v1/admin/schedules",
  "/api/v1/admin/holidays",
  "/api/v1/admin/flows",
  "/api/v1/admin/prompts",
  "/api/v1/admin/cdr",
  "/api/v1/admin/recordings",
  "/api/v1/admin/missed-calls",
  "/api/v1/admin/settings",
  "/api/v1/admin/secrets",
  "/api/v1/admin/webhooks",
  "/api/v1/admin/api-keys",
  "/api/v1/admin/audit-log",
  "/api/v1/admin/backups",
  "/api/v1/admin/devices",
  "/api/v1/admin/moh",
];

describe("admin read endpoints admit a live admin session", () => {
  it.each(ADMIN_READS)("GET %s -> not 401", async (url) => {
    const res = await app.inject({
      method: "GET",
      url,
      headers: auth(fx.adminToken),
    });
    expect(res.statusCode).not.toBe(401);
  });

  it("GET /admin/settings never returns secrets in plaintext", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/settings",
      headers: auth(fx.adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.body;
    // No SMTP/webhook/encryption credentials echoed back.
    expect(body).not.toContain("smtpPassword");
    expect(body).not.toContain("encryptionKey");
  });
});
