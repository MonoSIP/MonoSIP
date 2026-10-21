import { eq } from "drizzle-orm";
import { SettingsSchema } from "@munasip/shared";
import { ari } from "../asterisk/ari.js";
import { db } from "../db/client.js";
import { settings, trunks } from "../db/schema.js";
import { fetchTrunkEndpointStatus } from "../lib/ami.js";

const lastState = new Map<string, string>();

/** Poll AMI for trunk registration; email + DB status on drop. */
export function startTrunkMonitorJob(intervalMs = 60_000) {
  const tick = async () => {
    try {
      const rows = await db.select().from(trunks).where(eq(trunks.enabled, true));
      const [srow] = await db.select().from(settings).limit(1);
      const s = SettingsSchema.parse(srow?.data ?? {});

      for (const t of rows) {
        const endpoint = `trunk_${t.id.slice(0, 8)}`;
        const live = await fetchTrunkEndpointStatus(endpoint);
        const raw = (live.status ?? "unknown").toLowerCase();
        const status =
          raw === "unreachable" || raw === "unavailable"
            ? "down"
            : raw === "registered" || raw.includes("avail") || raw.includes("reachable")
              ? "up"
              : raw.startsWith("ami-error") || raw === "unknown"
                ? "unknown"
                : "down";

        await db
          .update(trunks)
          .set({ status, latencyMs: live.latencyMs ?? t.latencyMs })
          .where(eq(trunks.id, t.id));

        ari.emit("trunk.state", {
          id: t.id,
          name: t.name,
          status,
          latencyMs: live.latencyMs ?? t.latencyMs,
        });
        if (status === "down" && lastState.get(t.id) !== "down") {
          ari.emit("alert", { kind: "trunk.down", trunkId: t.id, name: t.name });
        }

        const prev = lastState.get(t.id);
        lastState.set(t.id, status);
        if (prev && prev !== "down" && status === "down" && s.smtpHost && s.smtpTo) {
          try {
            const { sendSmtpMail } = await import("../lib/smtp.js");
            await sendSmtpMail(
              {
                host: s.smtpHost,
                port: s.smtpPort,
                user: s.smtpUser,
                password: s.smtpPassword,
                from: s.emailFrom,
                to: s.smtpTo,
              },
              `MunaSIP trunk down: ${t.name}`,
              `Trunk ${t.name} (${endpoint}) is down (AMI: ${live.status}).\nAt: ${new Date().toISOString()}`,
            );
          } catch (e) {
            console.warn("[trunk-monitor] email failed", (e as Error).message);
          }
        }
      }
    } catch (e) {
      console.warn("[trunk-monitor]", (e as Error).message);
    }
  };

  void tick();
  setInterval(() => void tick(), intervalMs);
}
