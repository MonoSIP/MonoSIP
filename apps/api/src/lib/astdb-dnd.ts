import { amiAction } from "./ami.js";

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
    } else {
      try {
        await amiAction({
          Action: "DBDel",
          Family: "DND",
          Key: extensionNumber,
        });
      } catch (e) {
        // Key already absent — fine
        const msg = (e as Error).message ?? "";
        if (!/could not be deleted|not found|no such/i.test(msg)) throw e;
      }
    }
  } catch (e) {
    console.warn(`[dnd] AstDB sync failed for ${extensionNumber}:`, (e as Error).message);
  }
}

/** Seed AstDB DND keys from Postgres (call after config write / reload). */
export async function seedDndFromDb(
  rows: Array<{ number: string; dnd: boolean }>,
): Promise<void> {
  for (const r of rows) {
    await syncDndAstDb(r.number, r.dnd);
  }
}
