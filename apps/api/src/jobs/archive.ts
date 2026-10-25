import { eq } from "drizzle-orm";
import { copyFile, mkdir, writeFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { SettingsSchema } from "@monosip/shared";
import { db } from "../db/client.js";
import { recordings, settings } from "../db/schema.js";

function parseSftpUri(uri: string): {
  user: string;
  host: string;
  port: number;
  remotePath: string;
  password?: string;
} | null {
  try {
    const u = new URL(uri);
    if (u.protocol !== "sftp:") return null;
    return {
      user: decodeURIComponent(u.username || "root"),
      password: u.password ? decodeURIComponent(u.password) : undefined,
      host: u.hostname,
      port: u.port ? Number(u.port) : 22,
      remotePath: u.pathname || "/",
    };
  } catch {
    return null;
  }
}

export async function sftpPut(localFile: string, uri: string): Promise<void> {
  const parsed = parseSftpUri(uri);
  if (!parsed) throw new Error("Invalid SFTP URI");
  const remote = path.posix.join(parsed.remotePath.replace(/\/$/, "") || "/", path.basename(localFile));
  const batch = path.join(os.tmpdir(), `monosip-sftp-${Date.now()}.txt`);
  await writeFile(batch, `put ${localFile} ${remote}\nbye\n`);
  await new Promise<void>((resolve, reject) => {
    const args = ["-P", String(parsed.port), "-oBatchMode=no", "-b", batch, `${parsed.user}@${parsed.host}`];
    const env = { ...process.env };
    // Password URIs need sshpass -e; key-based auth uses plain sftp
    const usePass = Boolean(parsed.password);
    if (usePass) env.SSHPASS = parsed.password!;
    const bin = usePass ? "sshpass" : "sftp";
    const finalArgs = usePass ? ["-e", "sftp", ...args] : args;
    const child = spawn(bin, finalArgs, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", (e) => {
      void unlink(batch).catch(() => undefined);
      if (usePass && (e as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("sshpass not installed — use key-based sftp://user@host/path or install sshpass"));
      } else reject(e);
    });
    child.on("close", (code) => {
      void unlink(batch).catch(() => undefined);
      if (code === 0) resolve();
      else reject(new Error(err || `sftp exit ${code}`));
    });
  });
}

/** Probe SFTP connectivity (writes a tiny temp file then removes it). */
export async function testSftpUri(uri: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parseSftpUri(uri);
  if (!parsed) return { ok: false, error: "Invalid SFTP URI" };
  const tmp = path.join(os.tmpdir(), `monosip-sftp-probe-${Date.now()}.txt`);
  try {
    await writeFile(tmp, `monosip probe ${new Date().toISOString()}\n`);
    await sftpPut(tmp, uri);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
}

/** Local/NAS path copy and optional SFTP push for recording archive. */
export async function runRecordingArchive(): Promise<number> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  const s = SettingsSchema.parse(row?.data ?? {});
  const destRoot = s.recordingArchivePath || process.env.RECORDING_ARCHIVE_PATH || "";
  const sftpUri = s.recordingArchiveSftp || process.env.RECORDING_ARCHIVE_SFTP || "";
  if (!destRoot && !sftpUri) return 0;

  if (destRoot) await mkdir(destRoot, { recursive: true });
  const pending = await db.select().from(recordings).where(eq(recordings.archived, false));

  let n = 0;
  for (const rec of pending) {
    try {
      if (destRoot) {
        const dest = path.join(destRoot, path.basename(rec.filePath));
        await copyFile(rec.filePath, dest);
      }
      if (sftpUri) {
        await sftpPut(rec.filePath, sftpUri);
      }
      await db.update(recordings).set({ archived: true }).where(eq(recordings.id, rec.id));
      n++;
    } catch (e) {
      console.warn("[archive] failed", rec.id, (e as Error).message);
    }
  }
  if (n) console.log(`[archive] archived ${n} recordings`);
  return n;
}

export function startArchiveJob(intervalMs = 12 * 3600_000) {
  // A failed archive run must not become an unhandled rejection — that is fatal
  // and would take the whole API down mid-shift.
  void runRecordingArchive().catch((e) => console.warn("[archive]", (e as Error).message));
  return setInterval(
    () => void runRecordingArchive().catch((e) => console.warn("[archive]", (e as Error).message)),
    intervalMs,
  );
}
