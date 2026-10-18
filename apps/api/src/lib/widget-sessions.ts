import { eq, gt, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { webWidgets, widgetSessions } from "../db/schema.js";
import { decrypt } from "./crypto.js";

/** Active guest SIP users for Asterisk config generation. */
export async function listActiveWidgetSessions(): Promise<
  Array<{
    sipUser: string;
    password: string;
    widgetNumber: string;
    callerName: string | null;
    maxCallSeconds: number;
  }>
> {
  const now = new Date();
  await db.delete(widgetSessions).where(sql`${widgetSessions.expiresAt} < ${now}`);
  const rows = await db
    .select({
      sipUser: widgetSessions.sipUser,
      sipPassEnc: widgetSessions.sipPassEnc,
      callerName: widgetSessions.callerName,
      widgetNumber: webWidgets.number,
      maxCallSeconds: webWidgets.maxCallSeconds,
    })
    .from(widgetSessions)
    .innerJoin(webWidgets, eq(widgetSessions.widgetId, webWidgets.id))
    .where(gt(widgetSessions.expiresAt, now));

  return rows.map((r) => {
    let password = "";
    try {
      password = decrypt(r.sipPassEnc);
    } catch {
      password = "";
    }
    return {
      sipUser: r.sipUser,
      password,
      widgetNumber: r.widgetNumber,
      callerName: r.callerName,
      maxCallSeconds: r.maxCallSeconds,
    };
  });
}
