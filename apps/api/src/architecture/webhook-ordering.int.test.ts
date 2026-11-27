/**
 * Webhook vs DB ordering for call.ended / call.answered.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { db } from "../db/client.js";
import { cdr, webhooks } from "../db/schema.js";
import {
  __resetCdrWebhookDedupeForTests,
  cdrAnswered,
  cdrEnd,
  cdrIsOpen,
  cdrStart,
} from "../lib/cdr.js";
import { dispatchWebhooks } from "../lib/webhooks.js";
import { closeDb } from "../test/helpers.js";

const hookIds: string[] = [];
const callIds: string[] = [];
let n = 0;
const cid = () => `arch-wh-${Date.now()}-${n++}`;

afterAll(async () => {
  await closeDb();
});

beforeEach(() => {
  __resetCdrWebhookDedupeForTests();
});

afterEach(async () => {
  for (const id of hookIds) await db.delete(webhooks).where(eq(webhooks.id, id));
  hookIds.length = 0;
  for (const id of callIds) await db.delete(cdr).where(eq(cdr.callId, id));
  callIds.length = 0;
});

function collectWebhookServer() {
  const received: Array<{ event: string; body: unknown; at: number }> = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = raw;
      try {
        body = JSON.parse(raw);
      } catch {
        /* keep raw */
      }
      received.push({
        event: String(req.headers["x-monosip-event"] ?? ""),
        body,
        at: Date.now(),
      });
      res.writeHead(200);
      res.end("ok");
    });
  });
  return {
    received,
    listen: () =>
      new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const { port } = server.address() as AddressInfo;
          resolve({
            url: `http://127.0.0.1:${port}/hook`,
            close: () =>
              new Promise((r) => {
                server.close(() => r());
              }),
          });
        });
      }),
  };
}

describe("webhook vs DB event ordering", () => {
  it("call.answered webhook fires after answeredAt is written", async () => {
    const { received, listen } = collectWebhookServer();
    const { url, close } = await listen();
    const [hook] = await db
      .insert(webhooks)
      .values({
        url,
        secret: "arch-test-secret",
        events: ["call.answered"],
        active: true,
      })
      .returning();
    hookIds.push(hook!.id);

    const id = cid();
    callIds.push(id);
    await cdrStart({
      callId: id,
      direction: "inbound",
      caller: "90555",
      callee: "100",
    });
    await cdrAnswered(id);

    await vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(1), {
      timeout: 3000,
    });
    const [row] = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(row?.answeredAt).toBeTruthy();
    expect(received[0]?.event).toBe("call.answered");
    await close();
  });

  it("redirect leaves CDR open and does not require premature call.ended", async () => {
    // flow-runtime no longer dispatches call.ended while CDR stays open.
    const id = cid();
    callIds.push(id);
    await cdrStart({
      callId: id,
      direction: "inbound",
      caller: "90555",
      callee: "100",
      did: "100",
    });
    expect(cdrIsOpen(id)).toBe(true);
    const [row] = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(row?.endedAt).toBeNull();
  });

  it("cdrEnd emits call.ended only after endedAt is committed", async () => {
    const { received, listen } = collectWebhookServer();
    const { url, close } = await listen();
    const [hook] = await db
      .insert(webhooks)
      .values({
        url,
        secret: "arch-test-secret",
        events: ["call.ended"],
        active: true,
      })
      .returning();
    hookIds.push(hook!.id);

    const id = cid();
    callIds.push(id);
    await cdrStart({
      callId: id,
      direction: "inbound",
      caller: "90555",
      callee: "100",
    });
    await cdrEnd(id, "ANSWERED", { billsec: 5, duration: 8 });

    await vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(1), {
      timeout: 3000,
    });
    const [row] = await db.select().from(cdr).where(eq(cdr.callId, id));
    expect(row?.endedAt).toBeTruthy();
    expect(received[0]?.event).toBe("call.ended");
    await close();
  });

  it("duplicate cdrEnd does not re-emit call.ended", async () => {
    const { received, listen } = collectWebhookServer();
    const { url, close } = await listen();
    const [hook] = await db
      .insert(webhooks)
      .values({
        url,
        secret: "arch-test-secret",
        events: ["call.ended"],
        active: true,
      })
      .returning();
    hookIds.push(hook!.id);

    const id = cid();
    callIds.push(id);
    await cdrStart({
      callId: id,
      direction: "internal",
      caller: "101",
      callee: "102",
    });
    await cdrEnd(id, "ANSWERED", { billsec: 3, duration: 5 });
    await cdrEnd(id, "NOANSWER");
    await vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(1), {
      timeout: 3000,
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(received.filter((r) => r.event === "call.ended")).toHaveLength(1);
    await close();
  });

  it("raw dispatchWebhooks still delivers (no process dedupe at transport layer)", async () => {
    const { received, listen } = collectWebhookServer();
    const { url, close } = await listen();
    const [hook] = await db
      .insert(webhooks)
      .values({
        url,
        secret: "arch-test-secret",
        events: ["call.ended"],
        active: true,
      })
      .returning();
    hookIds.push(hook!.id);

    await dispatchWebhooks("call.ended", { channelId: "x", direction: "flow" });
    await dispatchWebhooks("call.ended", { channelId: "x", direction: "flow" });
    await vi.waitFor(() => expect(received.length).toBeGreaterThanOrEqual(2), {
      timeout: 4000,
    });
    expect(received.filter((r) => r.event === "call.ended").length).toBeGreaterThanOrEqual(2);
    await close();
  });

  it("timeout/failure: unreachable URL retries then gives up without throwing", async () => {
    const [hook] = await db
      .insert(webhooks)
      .values({
        url: "http://127.0.0.1:1/nope",
        secret: "arch-test-secret",
        events: ["call.ended"],
        active: true,
      })
      .returning();
    hookIds.push(hook!.id);
    await expect(
      dispatchWebhooks("call.ended", { channelId: "timeout-test" }),
    ).resolves.toBeUndefined();
  }, 20_000);
});
