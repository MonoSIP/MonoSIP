import { and, eq, inArray } from "drizzle-orm";
import { DEFAULT_ADMIN_PASSWORD, config } from "../config.js";
import { writeAudit } from "../lib/audit.js";
import { scryptHash } from "../lib/crypto.js";
import { db, pool } from "./client.js";
import { admins, ipBans, sessions } from "./schema.js";

/**
 * Lockout recovery: set every admin password back to the install default.
 * Sign-in email and two-factor setup are left as they are. Existing admin
 * sessions are removed. Login-flood rows in ip_bans are cleared; the API
 * process still keeps its own in-memory counter until it restarts or the
 * ban window ends.
 */
async function resetAdminPassword() {
  const rows = await db.select().from(admins);

  if (rows.length === 0) {
    const [created] = await db
      .insert(admins)
      .values({
        email: config.adminEmail,
        passwordHash: scryptHash(DEFAULT_ADMIN_PASSWORD),
        totpEnabled: false,
      })
      .returning();
    if (!created) throw new Error("Admin insert returned no row");
    await writeAudit({
      action: "admin.password_reset",
      objectType: "admin",
      objectId: created.id,
      after: { email: created.email, created: true },
    });
    console.log(`No admin account existed. Created ${created.email}.`);
  } else {
    for (const admin of rows) {
      await db
        .update(admins)
        .set({ passwordHash: scryptHash(DEFAULT_ADMIN_PASSWORD) })
        .where(eq(admins.id, admin.id));
      await writeAudit({
        action: "admin.password_reset",
        objectType: "admin",
        objectId: admin.id,
        after: { email: admin.email },
      });
    }
    await db
      .delete(sessions)
      .where(
        and(
          eq(sessions.actorType, "admin"),
          inArray(
            sessions.actorId,
            rows.map((row) => row.id),
          ),
        ),
      );
    console.log("Admin password restored to the install default.");
    console.log("Sign in as:");
    for (const admin of rows) {
      const totp = admin.totpEnabled ? " — two-factor authentication is still required" : "";
      console.log(`  ${admin.email}${totp}`);
    }
  }

  const cleared = await db
    .update(ipBans)
    .set({ active: false })
    .where(
      and(
        eq(ipBans.active, true),
        eq(ipBans.source, "login"),
        eq(ipBans.reason, "admin login flood"),
      ),
    )
    .returning({ id: ipBans.id });
  if (cleared.length > 0) {
    console.log(`Cleared ${cleared.length} temporary admin login ban(s) stored in the database.`);
  }

  console.log(`Password: ${DEFAULT_ADMIN_PASSWORD}`);
  console.log("Change it after you sign in (Settings → Admin sign-in).");
  console.log(
    "If the panel still says too many failed logins, restart the API so its in-memory ban counter drops.",
  );

  await pool.end();
  process.exit(0);
}

resetAdminPassword().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
