/**
 * Static schema / migration integrity checks (no live DB required).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(fileURLToPath(new URL("../../../../", import.meta.url)));
const SCHEMA = readFileSync(join(ROOT, "apps/api/src/db/schema.ts"), "utf8");
const BASE_SQL = readFileSync(
  join(ROOT, "apps/api/drizzle/0000_wakeful_warbound.sql"),
  "utf8",
);

describe("database schema integrity (static)", () => {
  it("declares the expected core tables", () => {
    for (const t of [
      "admins",
      "sessions",
      "extensions",
      "queues",
      "flows",
      "flowVersions",
      "cdr",
      "recordings",
      "trunks",
      "inboundRoutes",
      "outboundRoutes",
      "webhooks",
      "apiKeys",
      "webWidgets",
    ]) {
      expect(SCHEMA).toContain(`export const ${t} = pgTable`);
    }
  });

  it("cascade-deletes membership / child rows for extensions and queues", () => {
    expect(SCHEMA).toMatch(/extension_forwarding[\s\S]*onDelete:\s*"cascade"/);
    expect(SCHEMA).toMatch(/devices[\s\S]*onDelete:\s*"cascade"/);
    expect(SCHEMA).toMatch(/queue_members[\s\S]*onDelete:\s*"cascade"/);
    expect(SCHEMA).toMatch(/ring_group_members[\s\S]*onDelete:\s*"cascade"/);
    expect(SCHEMA).toMatch(/flow_versions[\s\S]*onDelete:\s*"cascade"/);
    expect(SCHEMA).toMatch(/voicemails[\s\S]*onDelete:\s*"cascade"/);
    expect(SCHEMA).toMatch(/recording_access_log[\s\S]*onDelete:\s*"cascade"/);
  });

  it("indexes hot CDR lookup paths", () => {
    expect(SCHEMA).toContain('index("cdr_started_idx")');
    expect(SCHEMA).toContain('uniqueIndex("cdr_call_id_uidx")');
    expect(BASE_SQL).toMatch(/cdr_started_idx|CREATE INDEX.*"cdr_started/i);
  });

  it("indexes hot recordings / call_events lookup paths (migration 0020)", () => {
    expect(SCHEMA).toContain('index("recordings_call_id_idx")');
    expect(SCHEMA).toContain('index("call_events_call_id_idx")');
    expect(SCHEMA).toContain('index("call_events_call_id_at_idx")');
    const sql0020 = readFileSync(
      join(ROOT, "apps/api/drizzle/0020_hotpath_call_id_indexes.sql"),
      "utf8",
    );
    expect(sql0020).toContain("recordings_call_id_idx");
    expect(sql0020).toContain("call_events_call_id_idx");
    expect(sql0020).toContain("call_events_call_id_at_idx");
  });


  it("documents intentional non-FK soft references on CDR", () => {
    // CDR must survive trunk/recording deletion for billing history.
    const cdrBlock = SCHEMA.slice(SCHEMA.indexOf("export const cdr = pgTable"));
    const truncated = cdrBlock.slice(0, cdrBlock.indexOf("export const callEvents"));
    expect(truncated).toContain('trunkId: uuid("trunk_id")');
    expect(truncated).toContain('recordingId: uuid("recording_id")');
    expect(truncated).not.toMatch(/trunkId:[\s\S]{0,80}\.references\(/);
    expect(truncated).not.toMatch(/recordingId:[\s\S]{0,80}\.references\(/);
  });

  it("sessions.actorId is polymorphic (no FK) by design", () => {
    const block = SCHEMA.slice(SCHEMA.indexOf("export const sessions = pgTable"));
    const truncated = block.slice(0, block.indexOf("export const extensions"));
    expect(truncated).toContain('actorId: uuid("actor_id").notNull()');
    expect(truncated).not.toMatch(/actorId:[\s\S]{0,60}\.references\(/);
  });

  it("flags unused recordings.deleteAt column (schema-only today)", () => {
    // Retention job uses createdAt + months; deleteAt is never written/read.
    expect(SCHEMA).toContain('deleteAt: timestamp("delete_at"');
    const retention = readFileSync(
      join(ROOT, "apps/api/src/jobs/retention.ts"),
      "utf8",
    );
    expect(retention).not.toContain("deleteAt");
    const writers = [
      readFileSync(join(ROOT, "apps/api/src/routes/admin-resources.ts"), "utf8"),
      readFileSync(join(ROOT, "apps/api/src/lib/recording-files.ts"), "utf8"),
      readFileSync(join(ROOT, "apps/api/src/lib/announce-call.ts"), "utf8"),
    ].join("\n");
    expect(writers).not.toMatch(/deleteAt\s*:/);
  });

  it("flags unused cdr.trunkId (column never written by app code)", () => {
    expect(SCHEMA).toContain('trunkId: uuid("trunk_id")');
    // outbound_routes.trunkIds (plural jsonb) is real; cdr.trunkId is not populated.
    const apiSrc = ["routes", "lib", "asterisk", "jobs"]
      .flatMap((dir) =>
        readdirSync(join(ROOT, "apps/api/src", dir))
          .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
          .map((f) => readFileSync(join(ROOT, "apps/api/src", dir, f), "utf8")),
      )
      .join("\n");
    expect(apiSrc).not.toMatch(/\.set\(\{[^}]*trunkId\s*:/);
    expect(apiSrc).not.toMatch(/insert\(cdr\)[\s\S]{0,200}trunkId\s*:/);
  });


  it("base migration FKs match schema cascade set", () => {
    for (const name of [
      "devices_extension_id_extensions_id_fk",
      "queue_members_queue_id_queues_id_fk",
      "flow_versions_flow_id_flows_id_fk",
      "recording_access_log_recording_id_recordings_id_fk",
    ]) {
      expect(BASE_SQL).toContain(name);
    }
  });
});
