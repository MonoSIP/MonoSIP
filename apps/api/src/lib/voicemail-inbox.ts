import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { voicemails } from "../db/schema.js";

/** Mailbox recordings land here, on the volume Asterisk and the API share. */
export function voicemailDir(): string {
  return path.join(config.asterisk.configDir, "voicemail");
}

/** Older dialplans always wrote under this path, even when configDir differed. */
const LEGACY_MAILBOX_DIR = "/var/lib/asterisk/munasip/voicemail";

function mailboxDirs(): string[] {
  const current = path.resolve(voicemailDir());
  const legacy = path.resolve(LEGACY_MAILBOX_DIR);
  return current === legacy ? [current] : [current, legacy];
}

/**
 * `100-1729000.12.wav` belongs to extension 100. UNIQUEID keeps its dot, so the
 * extension is only the digits before the first hyphen.
 */
export function mailboxOwner(fileName: string): string | null {
  const match = /^(\d+)-.+\.wav$/i.exec(fileName);
  return match?.[1] ?? null;
}

const importing = new Map<string, Promise<void>>();

/**
 * A hangup during Record() used to skip the dialplan post, so the wav sat on
 * disk and never reached the account. Pull those files in before the inbox
 * is listed.
 */
export function importMailboxFiles(extensionId: string, number: string): Promise<void> {
  const current = importing.get(extensionId);
  if (current) return current;
  const job = importMailboxFilesNow(extensionId, number).finally(() => {
    importing.delete(extensionId);
  });
  importing.set(extensionId, job);
  return job;
}

async function importMailboxFilesNow(extensionId: string, number: string): Promise<void> {
  const known = await db
    .select({ filePath: voicemails.filePath })
    .from(voicemails)
    .where(eq(voicemails.extensionId, extensionId));
  const knownPaths = new Set(known.map((row) => row.filePath));
  for (const dir of mailboxDirs()) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (mailboxOwner(name) !== number) continue;
      const filePath = path.join(dir, name);
      if (knownPaths.has(filePath)) continue;
      let info;
      try {
        info = await stat(filePath);
      } catch {
        continue;
      }
      if (!info.isFile() || info.size < 128) continue;
      await db.insert(voicemails).values({
        extensionId,
        caller: null,
        filePath,
        read: false,
        at: info.mtime,
      });
      knownPaths.add(filePath);
    }
  }
}
