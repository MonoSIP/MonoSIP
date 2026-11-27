import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { amiAction } from "./ami.js";

const execFileAsync = promisify(execFile);

/** Sync panel/portal DND flag into Asterisk AstDB so dialplan GotoIf(DB(DND/n)) works. */
export async function syncDndAstDb(extensionNumber: string, dnd: boolean): Promise<void> {
  try {
    if (dnd) {
      await amiAction({
        Action: "DBPut",
        Family: "DND",
        Key: extensionNumber,
        Val: "1",
      });
      return;
    }
    try {
      await amiAction({
        Action: "DBDel",
        Family: "DND",
        Key: extensionNumber,
      });
    } catch (e) {
      // Key already absent — fine (AMI error). Asterisk also logs WARNING on
      // missing DBDel; callers that bulk-seed should use seedDndFromDb instead.
      const msg = (e as Error).message ?? "";
      if (!/could not be deleted|not found|no such/i.test(msg)) throw e;
    }
  } catch (e) {
    console.warn(`[dnd] AstDB sync failed for ${extensionNumber}:`, (e as Error).message);
  }
}

/**
 * Seed AstDB DND keys from Postgres after config write / reload.
 * Prefer `database deltree DND` then Put enabled keys — avoids per-extension
 * DBDel WARNING spam when most extensions are not on DND.
 */
export async function seedDndFromDb(
  rows: Array<{ number: string; dnd: boolean }>,
): Promise<void> {
  let cleared = false;
  try {
    await execFileAsync("asterisk", ["-rx", "database deltree DND"], { timeout: 5000 });
    cleared = true;
  } catch {
    /* remote Asterisk / no CLI — Put enabled keys only below */
  }

  for (const r of rows) {
    if (r.dnd) await syncDndAstDb(r.number, true);
    else if (!cleared) {
      // No deltree: only Del when we cannot wipe the tree (may warn if absent).
      await syncDndAstDb(r.number, false);
    }
  }
}
