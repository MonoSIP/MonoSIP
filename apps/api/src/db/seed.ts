import { eq } from "drizzle-orm";
import { emptyFlow } from "@dsip/shared";
import { config } from "../config.js";
import { db, pool } from "./client.js";
import {
  admins,
  extensions,
  flows,
  inboundRoutes,
  queues,
  queueMembers,
  ringGroups,
  ringGroupMembers,
  schedules,
  scheduleRanges,
  settings,
  trunks,
} from "./schema.js";
import { deriveSipPassword, encrypt, scryptHash } from "../lib/crypto.js";
import { writeAsteriskConfig } from "../asterisk/config-writer.js";

async function seed() {
  console.log("Seeding database...");

  const [existingAdmin] = await db
    .select()
    .from(admins)
    .where(eq(admins.email, config.adminEmail))
    .limit(1);

  if (!existingAdmin) {
    await db.insert(admins).values({
      email: config.adminEmail,
      passwordHash: scryptHash(config.adminPassword),
      totpEnabled: false,
    });
    console.log(`Admin: ${config.adminEmail} / ${config.adminPassword}`);
  }

  const defaultSettings = {
    companyName: "DSip",
    defaultLocale: config.defaultLocale,
    recordingRetentionMonths: 12,
    kvkkAnnouncementEnabled: false,
    adminIpAllowlist: [] as string[],
    portalIpAllowlist: [] as string[],
    sipIpAllowlist: [] as string[],
    sipIpDenylist: [] as string[],
    securityLoginMaxRetry: 8,
    securityLoginBanMinutes: 15,
    allowedCountries: ["TR"],
    dailySpendLimitMinutes: 1000,
    monthlySpendLimitMinutes: 20000,
  };
  await db.insert(settings).values({ id: 1, data: defaultSettings }).onConflictDoNothing();
  // Lab: turn off bare KVKK beep that softphone users hear as a thin tone then silence
  const [existingSettings] = await db.select().from(settings).limit(1);
  if (existingSettings?.data && typeof existingSettings.data === "object") {
    const cur = existingSettings.data as Record<string, unknown>;
    if (cur.kvkkAnnouncementEnabled === true && !cur.kvkkPromptId) {
      await db
        .update(settings)
        .set({ data: { ...cur, kvkkAnnouncementEnabled: false } })
        .where(eq(settings.id, existingSettings.id));
    }
  }

  const sampleExts = [
    { number: "100", name: "Reception", password: "portal100" },
    { number: "101", name: "Alice", password: "portal101" },
    { number: "102", name: "Bob", password: "portal102" },
    { number: "103", name: "Carol", password: "portal103" },
  ];

  const extIds: Record<string, string> = {};
  for (const e of sampleExts) {
    const [found] = await db
      .select()
      .from(extensions)
      .where(eq(extensions.number, e.number))
      .limit(1);
    if (found) {
      extIds[e.number] = found.id;
      continue;
    }
    const [row] = await db
      .insert(extensions)
      .values({
        number: e.number,
        name: e.name,
        email: `${e.number}@example.com`,
        sipSecretEnc: encrypt(deriveSipPassword()),
        portalPasswordHash: scryptHash(e.password),
        portalEnabled: true,
      })
      .returning();
    extIds[e.number] = row.id;
    console.log(`Extension ${e.number} portal password: ${e.password}`);
  }

  const existingRg = await db.select().from(ringGroups).limit(1);
  if (!existingRg.length) {
    const [rg] = await db
      .insert(ringGroups)
      .values({ name: "Sales", number: "200", strategy: "ringall", ringSeconds: 25 })
      .returning();
    await db.insert(ringGroupMembers).values([
      { ringGroupId: rg.id, extensionId: extIds["101"], sortOrder: 0 },
      { ringGroupId: rg.id, extensionId: extIds["102"], sortOrder: 1 },
    ]);
  }

  const existingQ = await db.select().from(queues).limit(1);
  if (!existingQ.length) {
    const [q] = await db
      .insert(queues)
      .values({ name: "Support", number: "300", strategy: "rrmemory" })
      .returning();
    await db.insert(queueMembers).values([
      { queueId: q.id, extensionId: extIds["101"], penalty: 0 },
      { queueId: q.id, extensionId: extIds["102"], penalty: 0 },
      { queueId: q.id, extensionId: extIds["103"], penalty: 1 },
    ]);
  }

  const existingSched = await db.select().from(schedules).limit(1);
  let scheduleId: string | undefined = existingSched[0]?.id;
  if (!existingSched.length) {
    const [s] = await db
      .insert(schedules)
      .values({
        name: "Business hours",
        timezone: "Europe/Istanbul",
        openDestType: "queue",
        closedDestType: "voicemail",
        closedDestId: extIds["100"],
      })
      .returning();
    scheduleId = s.id;
    const ranges = [1, 2, 3, 4, 5].flatMap((day) => [
      { scheduleId: s.id, dayOfWeek: day, startTime: "09:00", endTime: "12:30", status: "open" },
      { scheduleId: s.id, dayOfWeek: day, startTime: "12:30", endTime: "13:30", status: "lunch" },
      { scheduleId: s.id, dayOfWeek: day, startTime: "13:30", endTime: "18:00", status: "open" },
    ]);
    await db.insert(scheduleRanges).values(ranges);
  }

  const existingFlow = await db.select().from(flows).limit(1);
  let flowId: string | undefined = existingFlow[0]?.id;
  if (!existingFlow.length) {
    const draft = emptyFlow();
    draft.nodes.push({
      id: "announce1",
      type: "announce",
      position: { x: 280, y: 120 },
      data: { text: "Welcome to DSip", label: "Welcome" },
    });
    draft.nodes.push({
      id: "menu1",
      type: "menu",
      position: { x: 520, y: 120 },
      data: {
        prompt: "Press 1 for Bob on 102, press 2 for Carol on 103",
        label: "Main menu",
      },
    });
    draft.nodes.push({
      id: "xfer1",
      type: "transfer",
      position: { x: 800, y: 40 },
      data: { destType: "extension", destId: "102", label: "Sales 102" },
    });
    draft.nodes.push({
      id: "xfer2",
      type: "transfer",
      position: { x: 800, y: 160 },
      data: { destType: "extension", destId: "103", label: "Support 103" },
    });
    draft.nodes.push({
      id: "hangup1",
      type: "hangup",
      position: { x: 800, y: 280 },
      data: { label: "Hangup" },
    });
    draft.edges.push(
      { id: "e1", source: "start", target: "announce1", sourceHandle: "next" },
      { id: "e2", source: "announce1", target: "menu1", sourceHandle: "next" },
      { id: "e3", source: "menu1", target: "xfer1", sourceHandle: "1", label: "1" },
      { id: "e4", source: "menu1", target: "xfer2", sourceHandle: "2", label: "2" },
      { id: "e5", source: "menu1", target: "hangup1", sourceHandle: "timeout", label: "timeout" },
      // Transfer failure exits (required to publish)
      { id: "e6", source: "xfer1", target: "hangup1", sourceHandle: "noanswer" },
      { id: "e7", source: "xfer1", target: "hangup1", sourceHandle: "busy" },
      { id: "e8", source: "xfer1", target: "hangup1", sourceHandle: "chanunavail" },
      { id: "e9", source: "xfer2", target: "hangup1", sourceHandle: "noanswer" },
      { id: "e10", source: "xfer2", target: "hangup1", sourceHandle: "busy" },
      { id: "e11", source: "xfer2", target: "hangup1", sourceHandle: "chanunavail" },
    );
    const [f] = await db
      .insert(flows)
      .values({ name: "Main IVR", extensionNumber: "900", draftJson: draft })
      .returning();
    flowId = f.id;
    const { flowVersions } = await import("./schema.js");
    const [ver] = await db
      .insert(flowVersions)
      .values({ flowId: f.id, version: 1, json: draft })
      .returning();
    await db
      .update(flows)
      .set({ publishedVersionId: ver.id, updatedAt: new Date() })
      .where(eq(flows.id, f.id));
    console.log("Main IVR published as v1 on 900");
  } else {
    // Ensure Main IVR has a dialable test number + destinations that aren't the softphone (101)
    const [main] = await db.select().from(flows).where(eq(flows.name, "Main IVR")).limit(1);
    if (main) {
      flowId = main.id;
      const draft = main.draftJson as {
        nodes?: Array<{ id: string; type: string; data?: Record<string, unknown> }>;
        edges?: unknown[];
        variables?: string[];
      };
      let changed = false;
      if (!main.extensionNumber) {
        await db.update(flows).set({ extensionNumber: "900" }).where(eq(flows.id, main.id));
      }
      if (Array.isArray(draft.nodes)) {
        for (const n of draft.nodes) {
          if (n.id === "xfer1" && n.data?.destId === "101") {
            n.data = { ...n.data, destId: "102", label: "Sales 102" };
            changed = true;
          }
          if (n.id === "xfer2" && n.data?.destId === "102") {
            // keep 102 only if xfer1 wasn't already 102; prefer 103 for option 2
            n.data = { ...n.data, destId: "103", label: "Support 103" };
            changed = true;
          }
          if (n.id === "menu1" && String(n.data?.prompt ?? "").includes("sales")) {
            n.data = {
              ...n.data,
              prompt: "Press 1 for Bob on 102, press 2 for Carol on 103",
            };
            changed = true;
          }
        }
      }
      if (changed) {
        await db
          .update(flows)
          .set({ draftJson: draft, updatedAt: new Date() })
          .where(eq(flows.id, main.id));
        // Republish so softphone dials the fixed destinations
        const { flowVersions } = await import("./schema.js");
        const versions = await db
          .select()
          .from(flowVersions)
          .where(eq(flowVersions.flowId, main.id));
        const next = versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
        const [ver] = await db
          .insert(flowVersions)
          .values({ flowId: main.id, version: next, json: draft })
          .returning();
        await db
          .update(flows)
          .set({ publishedVersionId: ver.id, updatedAt: new Date() })
          .where(eq(flows.id, main.id));
        console.log(`Main IVR destinations updated → 102/103 (v${next})`);
      }
    }
  }

  // Demo trunk only when explicitly requested — never re-create after a volume wipe
  // in a way that looks like "we replaced your SIP provider".
  const labSeed = process.env.DSIP_LAB_SEED === "1" || process.env.DSIP_LAB_SEED === "true";
  const existingTrunk = await db.select().from(trunks).limit(1);
  if (labSeed && !existingTrunk.length) {
    await db.insert(trunks).values({
      name: "Example SIP Provider (disabled)",
      host: "sip.example.com",
      port: 5060,
      transport: "udp",
      authType: "userpass",
      username: "user",
      secretEnc: encrypt("changeme"),
      enabled: false,
      status: "disabled",
    });
    console.log("Lab seed: example SIP trunk inserted (DSIP_LAB_SEED=1)");
  } else if (!existingTrunk.length) {
    console.log("No SIP trunks yet — add one in Admin → SIP providers (demo trunk not auto-seeded)");
  }

  const existingInbound = await db.select().from(inboundRoutes).limit(1);
  if (!existingInbound.length && flowId) {
    await db.insert(inboundRoutes).values({
      did: "default",
      priority: 100,
      destType: scheduleId ? "schedule" : "flow",
      destId: scheduleId ?? flowId,
    });
  }

  try {
    process.env.DSIP_ASTERISK_CLI_RELOAD = "0";
    await writeAsteriskConfig();
    console.log("Asterisk config written");
  } catch (e) {
    console.warn("Asterisk config write skipped:", (e as Error).message);
  }

  console.log("Seed complete");
  await pool.end();
  // writeAsteriskConfig may kick off background TTS — exit so entrypoint can start the API
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
