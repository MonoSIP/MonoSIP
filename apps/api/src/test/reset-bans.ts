import { beforeEach } from "vitest";

/**
 * Integration tests share one `monosip_test` database and run sequentially.
 * Login-flood cases (auth, auth-xff) can persist a DB `ip_bans` row for the
 * inject peer (127.0.0.1); nothing removed it, so a later suite that injects from
 * 127.0.0.1 hit `enforceAdminIpAccess` and got 403 instead of its expected 401 —
 * an order/timing-dependent flake. Clearing the ban table before every test makes
 * the suite deterministic. The ban-asserting tests create their rows inside the
 * test body (after this hook), so they are unaffected.
 */
beforeEach(async () => {
  const { db } = await import("../db/client.js");
  const { ipBans } = await import("../db/schema.js");
  await db.delete(ipBans);
});
