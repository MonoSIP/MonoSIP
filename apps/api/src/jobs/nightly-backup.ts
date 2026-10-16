import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { SettingsSchema } from "@dsip/shared";
import { db } from "../db/client.js";
import {
  blacklist,
  extensions,
  flows,
  inboundRoutes,
  outboundRoutes,
  queues,
  settings,
  trunks,
} from "../db/schema.js";
import { config } from "../config.js";

async function collectBackupJson(): Promise<object> {
  return {
    exportedAt: new Date().toISOString(),
    settings: await db.select().from(settings),
    trunks: await db.select().from(trunks),
    flows: await db.select().from(flows),
    inboundRoutes: await db.select().from(inboundRoutes),
    outboundRoutes: await db.select().from(outboundRoutes),
    blacklist: await db.select().from(blacklist),
    queues: await db.select().from(queues),
    extensions: (await db.select().from(extensions)).map((e) => ({
      ...e,
      sipSecretEnc: undefined,
      portalPasswordHash: undefined,
    })),
  };
}

/** Write settings JSON (+ optional pg_dump) to archive path / SFTP. */
export async function runNightlyBackup(): Promise<void> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  const s = SettingsSchema.parse(row?.data ?? {});
  const archive =
    s.recordingArchivePath?.trim() ||
    process.env.BACKUP_ARCHIVE_PATH ||
    path.join(config.uploadsDir, "backups");

  await mkdir(archive, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = path.join(archive, `dsip-settings-${stamp}.json`);
  const payload = await collectBackupJson();
  await writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[backup] wrote ${jsonPath}`);

  // Optional pg_dump when pg_dump binary + DATABASE_URL available
  try {
    const { spawn } = await import("node:child_process");
    const dumpPath = path.join(archive, `dsip-db-${stamp}.sql`);
    await new Promise<void>((resolve, reject) => {
      const p = spawn("pg_dump", [config.databaseUrl, "-f", dumpPath], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let err = "";
      p.stderr?.on("data", (c) => {
        err += String(c);
      });
      p.on("error", () => resolve()); // binary missing — skip
      p.on("close", (code) => {
        if (code === 0) {
          console.log(`[backup] wrote ${dumpPath}`);
          resolve();
        } else {
          console.warn("[backup] pg_dump skipped/failed:", err.slice(0, 200));
          resolve();
        }
      });
    });
  } catch (e) {
    console.warn("[backup] pg_dump unavailable:", (e as Error).message);
  }

  if (s.recordingArchiveSftp) {
    try {
      const { sftpPut } = await import("./archive.js");
      await sftpPut(jsonPath, s.recordingArchiveSftp);
      console.log("[backup] uploaded settings JSON via SFTP");
    } catch (e) {
      console.warn("[backup] SFTP upload failed:", (e as Error).message);
    }
  }
}

function msUntilNextLocalHour(hour: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 5, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Schedule backup around 02:05 local time daily. */
export function startNightlyBackupJob() {
  const schedule = () => {
    const wait = msUntilNextLocalHour(2);
    setTimeout(() => {
      void runNightlyBackup().catch((e) => console.warn("[backup]", (e as Error).message));
      setInterval(
        () => void runNightlyBackup().catch((e) => console.warn("[backup]", (e as Error).message)),
        24 * 3600_000,
      );
    }, wait);
    console.log(`[backup] next run in ${Math.round(wait / 60000)} min`);
  };
  schedule();
}
