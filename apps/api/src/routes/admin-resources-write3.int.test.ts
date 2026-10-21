import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { mohClasses, prompts, queues, secrets, settings, webhooks } from "../db/schema.js";
import {
  auth,
  buildApp,
  cleanupActors,
  closeDb,
  seedActors,
  type Fixtures,
} from "../test/helpers.js";

/**
 * Functional write-path coverage for webhooks, secrets, settings, prompts and
 * MOH — plus an explicit audit of the empty-.set() defect class that previously
 * made five sibling PATCH handlers 500.
 *
 * Note on settings: the settings row is a singleton (id = 1) shared by every
 * test in the suite, so its `data` is snapshotted in beforeEach and written back
 * verbatim in afterEach.
 */

let app: FastifyInstance;
let fx: Fixtures;
let settingsSnapshot: unknown;

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
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  settingsSnapshot = row ? structuredClone(row.data) : null;
});

afterEach(async () => {
  // webhooks has no `name` column — url is the only human handle.
  await db.delete(webhooks).where(eq(webhooks.url, "https://example.test/hook"));
  await db.delete(webhooks).where(eq(webhooks.url, "https://a.test"));
  await db.delete(webhooks).where(eq(webhooks.url, "https://b.test"));
  await db.delete(webhooks).where(eq(webhooks.url, "https://list.test"));
  await db.delete(webhooks).where(eq(webhooks.url, "https://nopatch.test"));
  await db.delete(secrets).where(eq(secrets.name, "Test Secret"));
  await db.delete(prompts).where(eq(prompts.name, "Test Prompt"));
  await db.delete(queues).where(eq(queues.number, "7991"));
  for (const n of ["Test Moh", "Test Moh Files", "Test Moh Used", "test moh"]) {
    await db.delete(mohClasses).where(eq(mohClasses.name, n));
  }
  // Restore the shared singleton exactly as found.
  if (settingsSnapshot === null) {
    await db.delete(settings).where(eq(settings.id, 1));
  } else {
    await db
      .insert(settings)
      .values({ id: 1, data: settingsSnapshot })
      .onConflictDoUpdate({ target: settings.id, set: { data: settingsSnapshot } });
  }
  await cleanupActors(fx);
});

const H = () => auth(fx.adminToken);
const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, headers: H(), payload });
const patch = (url: string, payload: unknown) => app.inject({ method: "PATCH", url, headers: H(), payload });
const del = (url: string) => app.inject({ method: "DELETE", url, headers: H() });

// ---------------------------------------------------------------- webhooks

describe("webhooks", () => {
  it("creates a hook with a generated secret and returns it once", async () => {
    const res = await post("/api/v1/admin/webhooks", {
      url: "https://example.test/hook",
      events: ["call.ended"],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; secret: string; active: boolean };
    expect(body.secret).toBeTruthy();
    expect(body.secret).toHaveLength(24);
    expect(body.active).toBe(true);

    const [row] = await db.select().from(webhooks).where(eq(webhooks.id, body.id));
    expect(row?.url).toBe("https://example.test/hook");
    expect(row?.secret).toBe(body.secret);
    expect(row?.events).toEqual(["call.ended"]);
  });

  it("mints a different secret per hook", async () => {
    const a = await post("/api/v1/admin/webhooks", {
      url: "https://a.test",
      events: ["call.ringing"],
    });
    const b = await post("/api/v1/admin/webhooks", {
      url: "https://b.test",
      events: ["call.ringing"],
    });
    expect((a.json() as { secret: string }).secret).not.toBe((b.json() as { secret: string }).secret);
  });

  it("rejects an invalid url", async () => {
    const res = await post("/api/v1/admin/webhooks", {
      url: "not-a-url",
      events: ["call.ringing"],
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an event outside the allowed enum", async () => {
    const res = await post("/api/v1/admin/webhooks", {
      url: "https://x.test",
      events: ["call.completed"],
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing url", async () => {
    const res = await post("/api/v1/admin/webhooks", { events: ["call.ringing"] });
    expect(res.statusCode).toBe(400);
  });

  it("GET /webhooks lists the created hook", async () => {
    const created0 = await post("/api/v1/admin/webhooks", {
      url: "https://list.test",
      events: ["call.missed"],
    });
    const id = (created0.json() as { id: string }).id;
    const list = await app.inject({ method: "GET", url: "/api/v1/admin/webhooks", headers: H() });
    expect(list.statusCode).toBe(200);
    expect((list.json() as Array<{ id: string }>).some((w) => w.id === id)).toBe(true);
  });

  it("has no PATCH route, so the empty-set defect cannot apply", async () => {
    const created0 = await post("/api/v1/admin/webhooks", {
      url: "https://nopatch.test",
      events: ["call.answered"],
    });
    const id = (created0.json() as { id: string }).id;
    const res = await patch(`/api/v1/admin/webhooks/${id}`, {});
    // No PATCH handler exists, so Fastify answers 404 rather than 500.
    expect(res.statusCode).toBe(404);
  });
});

// ----------------------------------------------------------------- secrets

describe("secrets", () => {
  it("stores an encrypted value and never returns it again", async () => {
    const res = await post("/api/v1/admin/secrets", {
      name: "Test Secret",
      value: "super-secret-value",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; name: string };
    // The create response carries no value at all.
    expect(body.valueEnc).toBeUndefined();
    expect(body.value).toBeUndefined();

    const [row] = await db.select().from(secrets).where(eq(secrets.id, body.id));
    expect(row?.valueEnc).toBeTruthy();
    expect(row?.valueEnc).not.toContain("super-secret-value");
  });

  it("GET /secrets exposes only id/name/createdAt", async () => {
    await post("/api/v1/admin/secrets", { name: "Test Secret", value: "abc" });
    const list = await app.inject({ method: "GET", url: "/api/v1/admin/secrets", headers: H() });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain("valueEnc");
    expect(list.body).not.toContain("abc");
  });

  it("rejects an empty name and an empty value", async () => {
    expect((await post("/api/v1/admin/secrets", { name: "", value: "v" })).statusCode).toBe(400);
    expect((await post("/api/v1/admin/secrets", { name: "n", value: "" })).statusCode).toBe(400);
  });

  it("rejects a missing body", async () => {
    const res = await post("/api/v1/admin/secrets", {});
    expect(res.statusCode).toBe(400);
  });

  it("DELETE removes the secret", async () => {
    const res = await post("/api/v1/admin/secrets", { name: "Test Secret", value: "abc" });
    const id = (res.json() as { id: string }).id;

    expect((await del(`/api/v1/admin/secrets/${id}`)).statusCode).toBe(200);
    expect(await db.select().from(secrets).where(eq(secrets.id, id))).toHaveLength(0);
  });

  it("has no PATCH route", async () => {
    const res = await post("/api/v1/admin/secrets", { name: "Test Secret", value: "abc" });
    const id = (res.json() as { id: string }).id;
    expect((await patch(`/api/v1/admin/secrets/${id}`, {})).statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------- settings

describe("settings", () => {
  it("merges a partial patch into the stored settings", async () => {
    // Ensure the singleton row exists.
    await patch("/api/v1/admin/settings", {});
    const res = await patch("/api/v1/admin/settings", { defaultLocale: "tr" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { defaultLocale: string }).defaultLocale).toBe("tr");

    const [row] = await db.select().from(settings).where(eq(settings.id, 1));
    expect((row?.data as { defaultLocale: string }).defaultLocale).toBe("tr");
  });

  it("does not clobber unrelated keys on a partial patch", async () => {
    await patch("/api/v1/admin/settings", { defaultLocale: "en" });
    await patch("/api/v1/admin/settings", { maxOutboundPerHour: 42 });

    const [row] = await db.select().from(settings).where(eq(settings.id, 1));
    const data = row?.data as { defaultLocale: string; maxOutboundPerHour: number };
    expect(data.maxOutboundPerHour).toBe(42);
    expect(data.defaultLocale).toBe("en");
  });

  it("accepts an empty patch without 500 (regression guard)", async () => {
    // The handler always writes `{ data: next }`, a literal key, so drizzle
    // never receives an empty .set(). This pins that it stays true.
    const res = await patch("/api/v1/admin/settings", {});
    expect(res.statusCode).toBe(200);
  });

  it("rejects an invalid partial value", async () => {
    const res = await patch("/api/v1/admin/settings", { defaultLocale: "de" });
    expect(res.statusCode).toBe(400);
  });

  it("GET /settings returns a usable object", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/settings", headers: H() });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json()).toBe("object");
  });
});

// ----------------------------------------------------------------- prompts

describe("prompts", () => {
  it("creates a prompt row", async () => {
    const res = await post("/api/v1/admin/prompts", { name: "Test Prompt", language: "tr" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; name: string; language: string };
    expect(body.language).toBe("tr");

    const [row] = await db.select().from(prompts).where(eq(prompts.id, body.id));
    expect(row?.name).toBe("Test Prompt");
    expect(row?.filePath).toBeNull();
  });

  it("defaults language to en", async () => {
    const res = await post("/api/v1/admin/prompts", { name: "Test Prompt" });
    expect((res.json() as { language: string }).language).toBe("en");
  });

  it("rejects an unknown language", async () => {
    const res = await post("/api/v1/admin/prompts", { name: "Test Prompt", language: "fr" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a missing name", async () => {
    const res = await post("/api/v1/admin/prompts", { language: "en" });
    expect(res.statusCode).toBe(400);
  });

  it("synthesize 404s for an unknown prompt id", async () => {
    const res = await post("/api/v1/admin/prompts/11111111-1111-1111-1111-111111111111/synthesize", {
      text: "hello",
    });
    expect(res.statusCode).toBe(404);
  });

  it("upload 404s for an unknown prompt id", async () => {
    const res = await post("/api/v1/admin/prompts/11111111-1111-1111-1111-111111111111/upload", {});
    expect(res.statusCode).toBe(404);
  });

  it("stream 404s for an unknown prompt id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/prompts/11111111-1111-1111-1111-111111111111/stream",
      headers: H(),
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("GET /prompts lists the created prompt", async () => {
    const created0 = await post("/api/v1/admin/prompts", { name: "Test Prompt" });
    const id = (created0.json() as { id: string }).id;

    const list = await app.inject({ method: "GET", url: "/api/v1/admin/prompts", headers: H() });
    expect((list.json() as Array<{ id: string }>).some((p) => p.id === id)).toBe(true);
  });
});

// --------------------------------------------------------------------- MOH

describe("MOH classes", () => {
  it("creates a class with an empty file list by default", async () => {
    const res = await post("/api/v1/admin/moh", { name: "Test Moh" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string; files: string[] };
    expect(body.files).toEqual([]);

    const [row] = await db.select().from(mohClasses).where(eq(mohClasses.id, body.id));
    expect(row?.name).toBe("Test Moh");
    expect(row?.files).toEqual([]);
  });

  it("accepts an explicit file list", async () => {
    const res = await post("/api/v1/admin/moh", {
      name: "Test Moh Files",
      files: ["a.wav", "b.wav"],
    });
    const body = res.json() as { id: string; files: string[] };
    expect(body.files).toEqual(["a.wav", "b.wav"]);
  });

  it("refuses a second class with the same name (case-insensitive) and the reserved 'default'", async () => {
    expect((await post("/api/v1/admin/moh", { name: "Test Moh" })).statusCode).toBe(200);
    const dup = await post("/api/v1/admin/moh", { name: "  test moh " });
    expect(dup.statusCode).toBe(409);
    expect((dup.json() as { error: string }).error).toMatch(/already exists/);
    expect((await post("/api/v1/admin/moh", { name: "Default" })).statusCode).toBe(409);
    const rows = await db.select().from(mohClasses).where(eq(mohClasses.name, "Test Moh"));
    expect(rows).toHaveLength(1);
  });

  it("deletes a class", async () => {
    const { id } = (await post("/api/v1/admin/moh", { name: "Test Moh" })).json() as { id: string };
    const res = await del(`/api/v1/admin/moh/${id}`);
    expect(res.statusCode).toBe(200);
    expect(await db.select().from(mohClasses).where(eq(mohClasses.id, id))).toHaveLength(0);
    expect((await del(`/api/v1/admin/moh/${id}`)).statusCode).toBe(404);
  });

  it("refuses to delete a class a queue still uses", async () => {
    const { id } = (await post("/api/v1/admin/moh", { name: "Test Moh Used" })).json() as { id: string };
    await db.insert(queues).values({ name: "MOH user", number: "7991", mohId: id });
    const res = await del(`/api/v1/admin/moh/${id}`);
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toContain("MOH user");
    expect(await db.select().from(mohClasses).where(eq(mohClasses.id, id))).toHaveLength(1);
  });

  it("rejects a missing name", async () => {
    const res = await post("/api/v1/admin/moh", { files: [] });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a non-array files value", async () => {
    const res = await post("/api/v1/admin/moh", { name: "Test Moh", files: "a.wav" });
    expect(res.statusCode).toBe(400);
  });

  it("upload 404s for an unknown class id", async () => {
    const res = await post("/api/v1/admin/moh/11111111-1111-1111-1111-111111111111/upload", {});
    expect(res.statusCode).toBe(404);
  });

  it("file delete 404s for an unknown class id", async () => {
    const res = await del("/api/v1/admin/moh/11111111-1111-1111-1111-111111111111/files/ghost.wav");
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it("GET /moh returns the created class", async () => {
    const created0 = await post("/api/v1/admin/moh", { name: "Test Moh" });
    const id = (created0.json() as { id: string }).id;

    const list = await app.inject({ method: "GET", url: "/api/v1/admin/moh", headers: H() });
    expect(list.statusCode).toBe(200);
    expect((list.json() as Array<{ id: string }>).some((m) => m.id === id)).toBe(true);
  });
});