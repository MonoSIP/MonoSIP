/**
 * Points the API at the throwaway `dsip_test` database before any test module
 * imports `db/client.js`. Setup files run before test files are imported, so
 * process.env.DATABASE_URL is already correct when the pg Pool is constructed.
 *
 * The dev `postgres` container publishes no host port, so tests reach it through
 * the local TCP forwarder on TEST_PG_PORT (see README/testing notes).
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, "../..");
const repoRoot = path.resolve(apiRoot, "../..");

function baseDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const raw = readFileSync(path.join(repoRoot, ".env"), "utf8");
  const line = raw.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env");
  return line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
}

const port = process.env.TEST_PG_PORT ?? "55433";
const testUrl = baseDatabaseUrl()
  .replace(/@[^/]+\//, `@localhost:${port}/`)
  .replace(/\/[^/?]+(\?|$)/, "/dsip_test$1");

process.env.DATABASE_URL = testUrl;

/**
 * Redirect every media directory into a writable scratch tree. The defaults
 * (`/var/lib/asterisk/dsip`, `/data/...`) only exist inside the containers, so
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