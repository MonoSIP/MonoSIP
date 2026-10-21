import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { extensions, mohClasses, prompts, recordings, recordingAccessLog, voicemails } from "../db/schema.js";
import {
  auth,
  buildApp,
  cleanupActors,
  closeDb,
  seedActors,
  type Fixtures,
} from "../test/helpers.js";

/**
 * Multipart upload + audio streaming coverage for prompts, MOH, recordings and
 * voicemails, driven by a real seeded WAV fixture.
 *
 * Fixtures live in .temp_files/fixtures and the writable media roots are
 * redirected by db-setup.ts, so uploads actually hit the filesystem here.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const FIXTURES = path.join(repoRoot, ".temp_files", "fixtures");
const TONE = path.join(FIXTURES, "tone-8k-mono.wav");
const TOO_SMALL = path.join(FIXTURES, "too-small.wav");
const REC_DIR = path.join(repoRoot, ".temp_files", "runtime", "recordings");

let app: FastifyInstance;
let fx: Fixtures;
const createdPrompts: string[] = [];
const createdMoh: string[] = [];
const createdRecordings: string[] = [];
const createdVoicemails: string[] = [];
const createdExtensions: string[] = [];
const createdFiles: string[] = [];

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
  for (const id of createdPrompts) await db.delete(prompts).where(eq(prompts.id, id));
  for (const id of createdMoh) await db.delete(mohClasses).where(eq(mohClasses.id, id));
  for (const id of createdRecordings) {
    await db.delete(recordingAccessLog).where(eq(recordingAccessLog.recordingId, id));
    await db.delete(recordings).where(eq(recordings.id, id));
  }
  for (const id of createdVoicemails) await db.delete(voicemails).where(eq(voicemails.id, id));
  for (const id of createdExtensions) await db.delete(extensions).where(eq(extensions.id, id));
  for (const f of createdFiles) if (existsSync(f)) rmSync(f, { force: true });
  createdPrompts.length = 0;
  createdMoh.length = 0;
  createdRecordings.length = 0;
  createdVoicemails.length = 0;
  createdExtensions.length = 0;
  createdFiles.length = 0;
  await cleanupActors(fx);
});

const H = () => auth(fx.adminToken);

/** Build a single-file multipart/form-data body plus its content-type header. */
function multipart(field: string, filename: string, filePath: string) {
  const boundary = `----munasiptest${Date.now().toString(16)}`;
  const buf = readFileSync(filePath);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
      `Content-Type: audio/wav\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    payload: Buffer.concat([head, buf, tail]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

async function createPrompt(name = "Upload Prompt") {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/admin/prompts",
    headers: H(),
    payload: { name },
  });
  const id = (res.json() as { id: string }).id;
  createdPrompts.push(id);
  return id;
}

async function createMoh(name = "Upload Moh") {
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/admin/moh",
    headers: H(),
    payload: { name },
  });
  const id = (res.json() as { id: string }).id;
  createdMoh.push(id);
  return id;
}

// ------------------------------------------------------------------ prompts

describe("prompt multipart upload", () => {
  it("uploads a real WAV and stores the resulting file path", async () => {
    const id = await createPrompt();
    const { payload, headers } = multipart("file", "tone.wav", TONE);

    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/prompts/${id}/upload`,
      headers: { ...H(), ...headers },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ok: boolean; filePath: string; media: string };
    expect(body.ok).toBe(true);
    expect(body.media).toBe(`sound:munasip/${id}`);
    // The file must really exist on disk.
    expect(existsSync(body.filePath)).toBe(true);
    createdFiles.push(body.filePath);

    const [row] = await db.select().from(prompts).where(eq(prompts.id, id));
    expect(row?.filePath).toBe(body.filePath);
  });

  it("rejects an upload with no file field", async () => {
    const id = await createPrompt();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/prompts/${id}/upload`,
      headers: { ...H(), "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a file smaller than the WAV header", async () => {
    const id = await createPrompt();
    const { payload, headers } = multipart("file", "tiny.wav", TOO_SMALL);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/prompts/${id}/upload`,
      headers: { ...H(), ...headers },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a non-WAV payload disguised as .wav", async () => {
    const id = await createPrompt();
    const junk = path.join(FIXTURES, "not-audio.wav");
    writeFileSync(junk, Buffer.alloc(200, 7));
    createdFiles.push(junk);

    const { payload, headers } = multipart("file", "junk.wav", junk);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/prompts/${id}/upload`,
      headers: { ...H(), ...headers },
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toContain("WAV");
  });

  it("404s an upload for an unknown prompt id", async () => {
    const { payload, headers } = multipart("file", "tone.wav", TONE);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/prompts/11111111-1111-1111-1111-111111111111/upload",
      headers: { ...H(), ...headers },
      payload,
    });
    expect(res.statusCode).toBe(404);
  });

  it("is admin-only", async () => {
    const id = await createPrompt();
    const { payload, headers } = multipart("file", "tone.wav", TONE);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/prompts/${id}/upload`,
      headers: { ...auth(fx.extensionToken), ...headers },
      payload,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("prompt streaming", () => {
  it("streams the uploaded audio back with audio/wav", async () => {
    const id = await createPrompt();
    const { payload, headers } = multipart("file", "tone.wav", TONE);
    const up = await app.inject({
      method: "POST",
      url: `/api/v1/admin/prompts/${id}/upload`,
      headers: { ...H(), ...headers },
      payload,
    });
    createdFiles.push((up.json() as { filePath: string }).filePath);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/prompts/${id}/stream`,
      headers: H(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("audio/wav");
    // Real bytes come back, not an empty envelope.
    expect(res.rawPayload.byteLength).toBeGreaterThan(128);
    expect(res.rawPayload.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("404s when the prompt has no audio", async () => {
    const id = await createPrompt();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/prompts/${id}/stream`,
      headers: H(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("404s when the stored file has been removed from disk", async () => {
    const id = await createPrompt();
    const { payload, headers } = multipart("file", "tone.wav", TONE);
    const up = await app.inject({
      method: "POST",
      url: `/api/v1/admin/prompts/${id}/upload`,
      headers: { ...H(), ...headers },
      payload,
    });
    const filePath = (up.json() as { filePath: string }).filePath;
    rmSync(filePath, { force: true });

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/prompts/${id}/stream`,
      headers: H(),
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------- MOH

describe("MOH multipart upload and streaming", () => {
  it("uploads a track into the class directory and streams it back", async () => {
    const id = await createMoh();
    const { payload, headers } = multipart("file", "hold-music.wav", TONE);

    const up = await app.inject({
      method: "POST",
      url: `/api/v1/admin/moh/${id}/upload`,
      headers: { ...H(), ...headers },
      payload,
    });
    expect(up.statusCode).toBe(200);

    const stream = await app.inject({
      method: "GET",
      url: `/api/v1/admin/moh/${id}/files/hold-music.wav/stream`,
      headers: H(),
    });
    expect(stream.statusCode).toBe(200);
    expect(stream.rawPayload.byteLength).toBeGreaterThan(128);
  });

  it("rejects a MOH upload with no file field", async () => {
    const id = await createMoh();
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/moh/${id}/upload`,
      headers: { ...H(), "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects a MOH upload smaller than 64 bytes", async () => {
    const id = await createMoh();
    const { payload, headers } = multipart("file", "tiny.wav", TOO_SMALL);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/admin/moh/${id}/upload`,
      headers: { ...H(), ...headers },
      payload,
    });
    expect(res.statusCode).toBe(400);
  });

  it("404s an upload for an unknown class id", async () => {
    const { payload, headers } = multipart("file", "tone.wav", TONE);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/moh/11111111-1111-1111-1111-111111111111/upload",
      headers: { ...H(), ...headers },
      payload,
    });
    expect(res.statusCode).toBe(404);
  });

  it("neutralizes a path-traversal filename on stream", async () => {
    const id = await createMoh();
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/moh/${id}/files/${encodeURIComponent("../../etc/passwd")}/stream`,
      headers: H(),
    });
    // The handler strips `/` and `\` before touching the filesystem, so the
    // traversal cannot escape the class directory. It then simply misses the
    // (now nonsensical) filename and answers 404 — no file is served either way.
    expect(res.statusCode).not.toBe(200);
    expect([400, 404]).toContain(res.statusCode);
  });

  it("deletes an uploaded track", async () => {
    const id = await createMoh();
    const { payload, headers } = multipart("file", "hold-music.wav", TONE);
    await app.inject({
      method: "POST",
      url: `/api/v1/admin/moh/${id}/upload`,
      headers: { ...H(), ...headers },
      payload,
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/api/v1/admin/moh/${id}/files/hold-music.wav`,
      headers: H(),
    });
    expect(del.statusCode).toBe(200);
  });
});

// --------------------------------------------------------------- recordings

describe("recordings streaming and download", () => {
  /** Seed a recording row pointing at a real file in the scratch dir. */
  async function seedRecording(fileName: string, bytes = 4044) {
    mkdirSync(REC_DIR, { recursive: true });
    const filePath = path.join(REC_DIR, fileName);
    writeFileSync(filePath, readFileSync(TONE).subarray(0, bytes));
    createdFiles.push(filePath);
    const [row] = await db
      .insert(recordings)
      .values({ callId: `rec-${fileName}`, filePath, duration: 1, sizeBytes: bytes })
      .returning();
    createdRecordings.push(row.id);
    return row;
  }

  it("streams audio and records an access-log entry", async () => {
    const row = await seedRecording("stream.wav");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/recordings/${row.id}/stream`,
      headers: H(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("audio/wav");
    expect(res.rawPayload.subarray(0, 4).toString("ascii")).toBe("RIFF");

    const log = await db
      .select()
      .from(recordingAccessLog)
      .where(eq(recordingAccessLog.recordingId, row.id));
    expect(log).toHaveLength(1);
    expect(log[0]?.action).toBe("stream");
    expect(log[0]?.actorType).toBe("admin");
  });

  it("downloads with a content-disposition attachment filename", async () => {
    const row = await seedRecording("download.wav");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/recordings/${row.id}/download`,
      headers: H(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toContain("attachment");
    expect(res.headers["content-disposition"]).toContain(`${row.id}.wav`);

    const log = await db
      .select()
      .from(recordingAccessLog)
      .where(eq(recordingAccessLog.recordingId, row.id));
    expect(log[0]?.action).toBe("download");
  });

  it("404s an unknown recording id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/admin/recordings/11111111-1111-1111-1111-111111111111/stream",
      headers: H(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("404s when the audio file has vanished from disk", async () => {
    const row = await seedRecording("gone.wav");
    rmSync(row.filePath, { force: true });
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/recordings/${row.id}/stream`,
      headers: H(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("404s a recording whose file is too small to serve", async () => {
    // The handler refuses files under 128 bytes as effectively empty.
    const row = await seedRecording("tiny-rec.wav", 64);
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/recordings/${row.id}/stream`,
      headers: H(),
    });
    expect(res.statusCode).toBe(404);
  });

  it("does not write an access-log row when the stream is refused", async () => {
    const row = await seedRecording("tiny-rec2.wav", 64);
    await app.inject({
      method: "GET",
      url: `/api/v1/admin/recordings/${row.id}/stream`,
      headers: H(),
    });
    const log = await db
      .select()
      .from(recordingAccessLog)
      .where(eq(recordingAccessLog.recordingId, row.id));
    expect(log).toHaveLength(0);
  });
});

// --------------------------------------------------------------- voicemails

describe("voicemail streaming", () => {
  async function seedVoicemail(extensionId: string, fileName: string) {
    mkdirSync(REC_DIR, { recursive: true });
    const filePath = path.join(REC_DIR, fileName);
    writeFileSync(filePath, readFileSync(TONE));
    createdFiles.push(filePath);
    const [row] = await db
      .insert(voicemails)
      .values({ extensionId, caller: "1000", filePath })
      .returning();
    createdVoicemails.push(row.id);
    return row;
  }

  it("streams the owner's voicemail", async () => {
    const vm = await seedVoicemail(fx.extensionId, "vm-owner.wav");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/me/voicemails/${vm.id}/stream`,
      headers: auth(fx.extensionToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("audio/wav");
    expect(res.headers["content-length"]).toBe(String(res.rawPayload.byteLength));
    expect(res.rawPayload.byteLength).toBeGreaterThan(128);
  });

  it("404s another extension's voicemail", async () => {
    // IDOR guard: the handler filters on extensionId, so a different
    // authenticated extension must not be able to read it.
    const [other] = await db
      .insert(extensions)
      .values({
        number: `8${Date.now()}`.slice(0, 16),
        name: "Other Ext",
        sipSecretEnc: "enc",
        portalEnabled: true,
        portalPasswordHash: "x",
      })
      .returning();
    createdExtensions.push(other.id);
    await db.insert(voicemails).values({
      extensionId: other.id,
      caller: "1000",
      filePath: readFileSync(TONE).length ? path.join(REC_DIR, "vm-other.wav") : "",
    });
    writeFileSync(path.join(REC_DIR, "vm-other.wav"), readFileSync(TONE));
    createdFiles.push(path.join(REC_DIR, "vm-other.wav"));
    const [vm] = await db.select().from(voicemails).where(eq(voicemails.extensionId, other.id));
    createdVoicemails.push(vm.id);

    const res = await app.inject({
      method: "GET",
      url: `/api/v1/me/voicemails/${vm.id}/stream`,
      headers: auth(fx.extensionToken),
    });
    expect(res.statusCode).toBe(404);
  });

  it("requires an extension session", async () => {
    const vm = await seedVoicemail(fx.extensionId, "vm-anon.wav");
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/me/voicemails/${vm.id}/stream`,
    });
    expect(res.statusCode).toBe(401);
  });

  it("deletes the owner's message and its file", async () => {
    const vm = await seedVoicemail(fx.extensionId, "vm-delete.wav");
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/me/voicemails/${vm.id}`,
      headers: auth(fx.extensionToken),
    });
    expect(res.statusCode).toBe(200);
    expect(existsSync(vm.filePath)).toBe(false);
    const [row] = await db.select().from(voicemails).where(eq(voicemails.id, vm.id));
    expect(row).toBeUndefined();
  });

  it("does not delete another extension's message", async () => {
    const [other] = await db
      .insert(extensions)
      .values({
        number: `9${Date.now()}`.slice(0, 16),
        name: "Other Mailbox",
        sipSecretEnc: "enc",
        portalEnabled: true,
        portalPasswordHash: "x",
      })
      .returning();
    createdExtensions.push(other.id);
    const vm = await seedVoicemail(other.id, "vm-not-mine.wav");
    const res = await app.inject({
      method: "DELETE",
      url: `/api/v1/me/voicemails/${vm.id}`,
      headers: auth(fx.extensionToken),
    });
    expect(res.statusCode).toBe(404);
    expect(existsSync(vm.filePath)).toBe(true);
  });
});