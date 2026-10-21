import { eq } from "drizzle-orm";
import { SettingsSchema, type Settings } from "@munasip/shared";
import { db } from "../db/client.js";
import { settings } from "../db/schema.js";

export async function loadSecuritySettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return SettingsSchema.parse(row?.data ?? {});
}
