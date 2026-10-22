import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { cdr, voicemails } from "../db/schema.js";

/** Mailbox recordings land here, on the volume Asterisk and the API share. */
export function voicemailDir(): string {
  return path.join(config.asterisk.configDir, "voicemail");
}

/** Older dialplans always wrote under this path, even when configDir differed. */
const LEGACY_MAILBOX_DIR = "/var/lib/asterisk/munasip/voicemail";

/** One directory, even when the legacy path is a symlink to the data volume. */
async function mailboxDirs(): Promise<string[]> {
  const out: string[] = [];
  for (const dir of [voicemailDir(), LEGACY_MAILBOX_DIR]) {
    try {
      const real = await realpath(dir);
      if (!out.includes(real)) out.push(real);
    } catch {
      /* not mounted */
    }
  }
  return out;
}

/** Same recording, whether the row stored the real path or the symlink path. */
export function mailboxKey(filePath: string): string {
  return path.basename(filePath).toLowerCase();
}

/** `100-1729000.12.wav` → Asterisk UNIQUEID `1729000.12`, which is the CDR call id. */
export function callIdFromMailbox(filePath: string): string | null {
  const base = path.basename(filePath).replace(/\.wav$/i, "");
  const dash = base.indexOf("-");
  if (dash <= 0) return null;
  const id = base.slice(dash + 1);
  return id || null;
}

/** Posted caller, or the CDR for this recording when the dialplan sent a blank. */
export async function resolveVoicemailCaller(
  filePath: string,
  posted: string | null | undefined,
): Promise<string | null> {
  return usableCaller(posted) ?? (await callerFromCdr(filePath));
}

/** The inbox row for this wav, ignoring whether the path is the symlink or the real file. */
export async function existingVoicemail(extensionId: string, filePath: string) {
  const rows = await db.select().from(voicemails).where(eq(voicemails.extensionId, extensionId));
  return rows.find((row) => mailboxKey(row.filePath) === mailboxKey(filePath)) ?? null;
}

/** Empty, a dash, or a placeholder is not a caller number. */
export function usableCaller(value: string | null | undefined): string | null {
  const caller = (value ?? "").trim();
  if (!caller || caller === "-" || caller === "—" || /^(unknown|anonymous)$/i.test(caller)) return null;
  return caller;
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

async function callerFromCdr(filePath: string): Promise<string | null> {
  const callId = callIdFromMailbox(filePath);
  if (!callId) return null;
  const rows = await db.select({ caller: cdr.caller }).from(cdr).where(eq(cdr.callId, callId)).limit(5);
  for (const row of rows) {
    const caller = usableCaller(row.caller);
    if (caller) return caller;
  }
  return null;
}

async function importMailboxFilesNow(extensionId: string, number: string): Promise<void> {
  const known = await db
    .select({ filePath: voicemails.filePath })
    .from(voicemails)
    .where(eq(voicemails.extensionId, extensionId));
  const knownKeys = new Set(known.map((row) => mailboxKey(row.filePath)));
  for (const dir of await mailboxDirs()) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (mailboxOwner(name) !== number) continue;
      const key = mailboxKey(name);
      if (knownKeys.has(key)) continue;
      const filePath = path.join(dir, name);
      let info;
      try {
        info = await stat(filePath);
      } catch {
        continue;
      }
      if (!info.isFile() || info.size < 128) continue;
      await db.insert(voicemails).values({
        extensionId,
        caller: await callerFromCdr(filePath),
        filePath,
        read: false,
        at: info.mtime,
      });
      knownKeys.add(key);
    }
  }
  await collapseDuplicateVoicemails(extensionId);
}

/** A symlink path and the real path used to insert the same wav twice. Keep one. */
async function collapseDuplicateVoicemails(extensionId: string): Promise<void> {
  const rows = await db.select().from(voicemails).where(eq(voicemails.extensionId, extensionId));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = mailboxKey(row.filePath);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  for (const group of groups.values()) {
    const [keep, ...extra] = group.sort((a, b) => {
      const rank = (caller: string | null) => (usableCaller(caller) ? 1 : 0);
      const byCaller = rank(b.caller) - rank(a.caller);
      if (byCaller !== 0) return byCaller;
      return a.at.getTime() - b.at.getTime();
    });
    if (!keep) continue;
    const caller = usableCaller(keep.caller) ?? (await callerFromCdr(keep.filePath));
    if (caller && caller !== keep.caller) {
      await db.update(voicemails).set({ caller }).where(eq(voicemails.id, keep.id));
    }
    for (const row of extra) {
      await db.delete(voicemails).where(eq(voicemails.id, row.id));
    }
  }
}
