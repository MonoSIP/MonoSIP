/**
 * Re-encrypt every stored secret from one ENCRYPTION_KEY to another.
 *
 * MonoSIP encrypts SIP / trunk / provisioning / widget / integration secrets at
 * rest with AES-256-GCM under ENCRYPTION_KEY. Changing that key makes existing
 * ciphertext undecryptable, so the key cannot simply be swapped — every value
 * must be decrypted with the old key and re-encrypted with the new one first.
 *
 * Usage (inside the container / with DATABASE_URL set):
 *   OLD_ENCRYPTION_KEY=<64 hex> NEW_ENCRYPTION_KEY=<64 hex> \
 *     tsx src/db/rotate-encryption-key.ts            # dry run, reports counts
 *   OLD_ENCRYPTION_KEY=... NEW_ENCRYPTION_KEY=... \
 *     tsx src/db/rotate-encryption-key.ts --apply    # writes
 *
 * Safe to re-run: a value already encrypted under the new key is detected
 * (it decrypts with NEW, not OLD) and skipped. Take a DB backup first anyway.
 *
 * After --apply succeeds, set ENCRYPTION_KEY=<new> in the environment and
 * redeploy so the app (and the next Asterisk config write) use the new key.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import pg from "pg";

const ALGO = "aes-256-gcm";

function keyBytes(hex: string): Buffer {
  const b = Buffer.from(hex.slice(0, 64), "hex");
  if (b.length !== 32) throw new Error(`key must be 64 hex chars (32 bytes), got ${b.length} bytes`);
  return b;
}

function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/** Decrypt; returns null when the payload was not sealed with this key (bad tag). */
function tryDecrypt(payload: string, key: Buffer): string | null {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) return null;
  try {
    const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

const TARGETS: Array<{ table: string; col: string }> = [
  { table: "extensions", col: "sip_secret_enc" },
  { table: "trunks", col: "secret_enc" },
  { table: "secrets", col: "value_enc" },
  { table: "devices", col: "provision_secret_enc" },
  { table: "widget_sessions", col: "sip_pass_enc" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.DATABASE_URL;
  const oldHex = process.env.OLD_ENCRYPTION_KEY;
  const newHex = process.env.NEW_ENCRYPTION_KEY;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!oldHex || !newHex) throw new Error("OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY are required");
  if (oldHex === newHex) throw new Error("OLD and NEW keys are identical — nothing to do");
  const oldKey = keyBytes(oldHex);
  const newKey = keyBytes(newHex);

  const pool = new pg.Pool({ connectionString: databaseUrl });
  console.log(apply ? "ROTATING (writing)…" : "DRY RUN (no writes) — pass --apply to write\n");

  let grandMigrated = 0;
  let grandFailed = 0;
  try {
    for (const { table, col } of TARGETS) {
      const { rows } = await pool.query(
        `SELECT id, ${col} AS v FROM ${table} WHERE ${col} IS NOT NULL`,
      );
      let migrated = 0;
      let already = 0;
      let failed = 0;
      for (const row of rows as Array<{ id: string; v: string }>) {
        // Already under the new key? Leave it (makes the script re-runnable).
        if (tryDecrypt(row.v, newKey) !== null) {
          already++;
          continue;
        }
        const plain = tryDecrypt(row.v, oldKey);
        if (plain === null) {
          failed++;
          console.warn(`  ! ${table}.${col} id=${row.id}: decrypts with neither key — left untouched`);
          continue;
        }
        if (apply) {
          const next = encrypt(plain, newKey);
          await pool.query(`UPDATE ${table} SET ${col} = $1 WHERE id = $2`, [next, row.id]);
        }
        migrated++;
      }
      grandMigrated += migrated;
      grandFailed += failed;
      console.log(
        `  ${table}.${col}: ${rows.length} rows — ${migrated} ${apply ? "rotated" : "to rotate"}, ${already} already new, ${failed} failed`,
      );
    }
  } finally {
    await pool.end();
  }

  console.log(
    `\n${apply ? "Rotated" : "Would rotate"} ${grandMigrated} value(s); ${grandFailed} failed.`,
  );
  if (grandFailed > 0) {
    console.error("Some values decrypted with neither key — check OLD_ENCRYPTION_KEY before applying.");
    process.exit(2);
  }
  if (apply) {
    console.log("Now set ENCRYPTION_KEY to the new value in the environment and redeploy.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
