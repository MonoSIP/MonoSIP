import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import path from "node:path";

type CacheRow = {
  id: string;
  cacheKey: string;
  text: string;
  language: string;
  voice: string;
  lengthScale: string;
  filePath: string;
  createdAt: Date;
  expiresAt: Date;
};

const { AST_DIR, state } = vi.hoisted(() => ({
  AST_DIR: "/tmp/munasip-tts-cache-test",
  state: {
    cacheRows: [] as CacheRow[],
    settingsData: { ttsCacheRetentionDays: 7 } as Record<string, unknown>,
    files: new Set<string>(),
    inserts: 0,
    updates: 0,
    deletes: 0,
    fetchCount: 0,
  },
}));

function expectedKey(text: string, language = "en", lengthScale = 1.05, voice = "female") {
  const digest = createHash("sha1")
    .update(`${language}|${lengthScale}|${voice}|${text}`)
    .digest("hex")
    .slice(0, 24);
  return `c-${digest}`;
}

function makeWav(): Buffer {
  const samples = 80;
  const dataSize = samples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(16000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

vi.mock("../config.js", () => ({
  config: {
    ttsUrl: "http://127.0.0.1:5599",
    asterisk: { configDir: AST_DIR },
  },
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    access: vi.fn(async (p: string) => {
      if (!state.files.has(String(p))) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
    }),
    mkdir: vi.fn(async () => undefined),
    chmod: vi.fn(async () => undefined),
    writeFile: vi.fn(async (p: string) => {
      state.files.add(String(p));
    }),
    unlink: vi.fn(async (p: string) => {
      state.files.delete(String(p));
    }),
  };
});

vi.mock("../db/client.js", () => {
  function tableName(table: unknown): string {
    const t = table as { _: { name?: string } };
    if (t?._?.name) return t._.name;
    for (const s of Object.getOwnPropertySymbols(table as object)) {
      if (String(s).includes("Name")) {
        const v = (table as Record<symbol, unknown>)[s];
        if (typeof v === "string") return v;
      }
    }
    // Fallback: settings table has a `data` column key on the object
    if (table && typeof table === "object" && "data" in table) return "settings";
    return "tts_cache";
  }

  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => {
          const name = tableName(table);
          if (name === "settings") {
            return {
              limit: vi.fn(async () => [{ data: state.settingsData }]),
            };
          }
          // tts_cache: where().limit(1) = lookup; await where() = purge (expired only)
          return {
            where: vi.fn(() => {
              const chain = {
                limit: vi.fn(async (n = 1) => state.cacheRows.slice(0, n)),
                then: (resolve: (v: CacheRow[]) => unknown, reject?: (e: unknown) => unknown) => {
                  const expired = state.cacheRows.filter((r) => r.expiresAt.getTime() < Date.now());
                  return Promise.resolve(expired).then(resolve, reject);
                },
              };
              return chain;
            }),
          };
        }),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async (vals: Omit<CacheRow, "id" | "createdAt">) => {
          state.inserts += 1;
          state.cacheRows.push({
            id: `id-${state.inserts}`,
            createdAt: new Date(),
            ...vals,
          });
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn((vals: Partial<CacheRow>) => ({
          where: vi.fn(async () => {
            state.updates += 1;
            if (state.cacheRows[0]) {
              Object.assign(state.cacheRows[0], vals);
            }
          }),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(async () => {
          state.deletes += 1;
          state.cacheRows = state.cacheRows.filter((r) => r.expiresAt.getTime() >= Date.now());
        }),
      })),
    },
  };
});

import { ensureSpeechMedia, purgeExpiredTtsCache, speechCacheId } from "./tts.js";

describe("speechCacheId", () => {
  it("is stable for same inputs", () => {
    expect(speechCacheId("hello", "en", 1.05, "female")).toBe(expectedKey("hello"));
    expect(speechCacheId("hello", "en", 1.05, "female")).toBe(
      speechCacheId("hello", "en", 1.05, "female"),
    );
  });
});

describe("ensureSpeechMedia cache", () => {
  beforeEach(async () => {
    state.cacheRows = [];
    state.settingsData = { ttsCacheRetentionDays: 7 };
    state.files = new Set();
    state.inserts = 0;
    state.updates = 0;
    state.deletes = 0;
    state.fetchCount = 0;
    // Prime purge throttle so ensureSpeechMedia's fire-and-forget purge is a no-op
    await purgeExpiredTtsCache(true);
    state.deletes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        state.fetchCount += 1;
        return new Response(makeWav(), {
          status: 200,
          headers: { "content-type": "audio/wav" },
        });
      }),
    );
  });

  it("hits when DB row is fresh and WAV exists", async () => {
    const text = "Welcome to support";
    const key = speechCacheId(text, "en", 1.05, "female");
    const filePath = path.join(AST_DIR, "sounds", "munasip", `${key}.wav`);
    state.files.add(filePath);
    state.cacheRows.push({
      id: "row-1",
      cacheKey: key,
      text,
      language: "en",
      voice: "female",
      lengthScale: "1.05",
      filePath,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    });

    const result = await ensureSpeechMedia(text, "en", 1.05, "female");
    expect(result.cached).toBe(true);
    expect(result.media).toBe(`sound:munasip/${key}`);
    expect(state.fetchCount).toBe(0);
    expect(state.inserts).toBe(0);
  });

  it("miss synthesizes and inserts cache row", async () => {
    const text = "Press one for sales";
    const key = speechCacheId(text, "en", 1.05, "female");

    const result = await ensureSpeechMedia(text, "en", 1.05, "female");
    expect(result.cached).toBe(false);
    expect(result.media).toBe(`sound:munasip/${key}`);
    expect(state.fetchCount).toBe(1);
    expect(state.inserts).toBe(1);
    expect(state.cacheRows[0]!.cacheKey).toBe(key);
    expect(state.cacheRows[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("expired row with missing file resynthesizes", async () => {
    const text = "Goodbye";
    const key = speechCacheId(text, "en", 1.05, "female");
    const filePath = path.join(AST_DIR, "sounds", "munasip", `${key}.wav`);
    state.cacheRows.push({
      id: "row-gone",
      cacheKey: key,
      text,
      language: "en",
      voice: "female",
      lengthScale: "1.05",
      filePath,
      createdAt: new Date(Date.now() - 10 * 86400_000),
      expiresAt: new Date(Date.now() - 60_000),
    });

    const result = await ensureSpeechMedia(text, "en", 1.05, "female");
    expect(result.cached).toBe(false);
    expect(state.fetchCount).toBe(1);
    expect(state.updates + state.inserts).toBeGreaterThanOrEqual(1);
  });

  it("orphan WAV (no DB row) is adopted without synth", async () => {
    const text = "Your call is important";
    const key = speechCacheId(text, "en", 1.05, "female");
    const filePath = path.join(AST_DIR, "sounds", "munasip", `${key}.wav`);
    state.files.add(filePath);

    const result = await ensureSpeechMedia(text, "en", 1.05, "female");
    expect(result.cached).toBe(true);
    expect(result.media).toBe(`sound:munasip/${key}`);
    expect(state.fetchCount).toBe(0);
    expect(state.inserts).toBe(1);
    expect(state.cacheRows[0]!.cacheKey).toBe(key);
  });
});

describe("purgeExpiredTtsCache", () => {
  beforeEach(() => {
    state.cacheRows = [];
    state.files = new Set();
    state.deletes = 0;
  });

  it("removes expired WAV + row when forced", async () => {
    const filePath = path.join(AST_DIR, "sounds", "munasip", "c-deadbeef.wav");
    state.files.add(filePath);
    state.cacheRows.push({
      id: "exp-1",
      cacheKey: "c-deadbeef",
      text: "old",
      language: "en",
      voice: "female",
      lengthScale: "1.05",
      filePath,
      createdAt: new Date(Date.now() - 20 * 86400_000),
      expiresAt: new Date(Date.now() - 1000),
    });

    const n = await purgeExpiredTtsCache(true);
    expect(n).toBe(1);
    expect(state.files.has(filePath)).toBe(false);
    expect(state.deletes).toBe(1);
  });
});
