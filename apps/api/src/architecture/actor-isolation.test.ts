/**
 * MonoSIP is a single-tenant company PBX (no org/tenant_id column).
 * Isolation = actor boundaries: admin vs extension portal vs widget vs internal.
 * These tests lock that model and scan critical ownership filters.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(fileURLToPath(new URL("../../../../", import.meta.url)));
const SCHEMA = readFileSync(join(ROOT, "apps/api/src/db/schema.ts"), "utf8");
const PORTAL = readFileSync(join(ROOT, "apps/api/src/routes/portal.ts"), "utf8");
const WS = readFileSync(join(ROOT, "apps/api/src/routes/ws.ts"), "utf8");
const AUTH = readFileSync(join(ROOT, "apps/api/src/lib/auth.ts"), "utf8");

describe("actor isolation model", () => {
  it("schema has no multi-tenant columns", () => {
    expect(SCHEMA).not.toMatch(/\btenant[_A-Z]/i);
    expect(SCHEMA).not.toMatch(/\borgId\b/);
    expect(SCHEMA).not.toMatch(/\borganization[_A-Z]/i);
    expect(SCHEMA).not.toMatch(/\bworkspace[_A-Z]*Id\b/i);
  });

  it("auth exposes requireAdmin and requireExtension", () => {
    expect(AUTH).toContain("export async function requireAdmin");
    expect(AUTH).toContain("export async function requireExtension");
    expect(AUTH).toContain('actor.type !== "admin"');
    expect(AUTH).toContain('actor.type !== "extension"');
  });

  it("portal recording stream checks CDR ownership before streaming", () => {
    expect(PORTAL).toContain("/api/v1/me/recordings/:id/stream");
    expect(PORTAL).toMatch(/Ownership: recording must belong/);
    expect(PORTAL).toContain("eq(cdr.callId, rec.callId)");
    expect(PORTAL).toContain("eq(cdr.extensionNumber, a.number)");
  });

  it("portal voicemail mutations scope by extensionId", () => {
    expect(PORTAL).toContain("eq(voicemails.extensionId, a.id)");
    expect(PORTAL).toContain("and(eq(voicemails.id, id), eq(voicemails.extensionId, a.id))");
  });

  it("WebSocket filters admin-only vs extension-owned events", () => {
    expect(WS).toContain('if (actor.type === "admin") send("call.update"');
    expect(WS).toContain('if (actor.type === "admin") send("trunk.state"');
    expect(WS).toContain("p.extension === (actor as { number: string }).number");
    expect(WS).toContain("p.target === (actor as { number: string }).number");
  });

  it("WebSocket tears down listeners when socket closes during auth", () => {
    expect(WS).toContain("socket.on(\"close\", () => teardown())");
    expect(WS).toContain("if (closed) return; // socket died during auth");
  });
});
