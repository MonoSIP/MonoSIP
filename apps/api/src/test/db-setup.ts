/**
 * Points the API at the throwaway `monosip_test` database before any test module
 * imports `db/client.js`. Setup files run before test files are imported, so
 * process.env.DATABASE_URL is already correct when the pg Pool is constructed.
 *
 * The dev `postgres` container publishes no host port, so tests reach it through
 * the local TCP forwarder on TEST_PG_PORT (see README/testing notes).
 *
 * Also applies pending Drizzle migrations so host vitest stays in sync with
 * compose (API entrypoint migrates `monosip`, not `monosip_test`).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "../..");
const repoRoot = path.resolve(apiRoot, "../..");

function baseDatabaseUrl(): string {
  const raw = readFileSync(path.join(repoRoot, ".env"), "utf8");
  const line = raw.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env");
  return line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
}

/**
 * Prefer an explicit TEST_DATABASE_URL (CI service Postgres on :5432). Locally,
 * rewrite the Compose DATABASE_URL onto the host forwarder port (default 55433)
 * and the throwaway monosip_test database.
 */
const testUrl = (() => {
  const explicit = process.env.TEST_DATABASE_URL?.trim();
  if (explicit) return explicit;
  const port = process.env.TEST_PG_PORT ?? "55433";
  return baseDatabaseUrl()
    .replace(/@[^/]+\//, `@localhost:${port}/`)
    .replace(/\/[^/?]+(\?|$)/, "/monosip_test$1");
})();

process.env.DATABASE_URL = testUrl;

/**
 * Redirect every media directory into a writable scratch tree. The defaults
 * (`/var/lib/asterisk/monosip`, `/data/...`) only exist inside the containers, so
 * multipart upload / streaming tests would otherwise fail on ENOENT/EACCES.
 * Set before `config.ts` is imported by any test module.
 */
const runtimeRoot = path.join(repoRoot, ".temp_files", "runtime");
for (const dir of ["asterisk", "recordings", "uploads"]) {
  const full = path.join(runtimeRoot, dir);
  mkdirSync(full, { recursive: true });
  process.env[
    { asterisk: "ASTERISK_CONFIG_DIR", recordings: "RECORDINGS_DIR", uploads: "UPLOADS_DIR" }[dir]!
  ] = full;
}

/** Minimal 8 kHz mono PCM WAV (CI has no checked-in .temp_files/). */
function writeToneWav(filePath: string, durationSec: number) {
  const sampleRate = 8000;
  const n = Math.floor(sampleRate * durationSec);
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 16000, 44 + i * 2);
  }
  writeFileSync(filePath, buf);
}

const fixturesDir = path.join(repoRoot, ".temp_files", "fixtures");
mkdirSync(fixturesDir, { recursive: true });
writeToneWav(path.join(fixturesDir, "tone-8k-mono.wav"), 0.25);
writeToneWav(path.join(fixturesDir, "tone-8k-mono-1s.wav"), 1);
writeFileSync(path.join(fixturesDir, "too-small.wav"), Buffer.from("not-a-wav"));

const migrationsFolder = path.join(apiRoot, "drizzle");
const pool = new pg.Pool({ connectionString: testUrl });
await migrate(drizzle(pool), { migrationsFolder });
await pool.end();
