import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import WebSocket from "ws";
import { ari } from "../asterisk/ari.js";
import { liveEvents } from "../lib/live-events.js";
import { wsRoutes } from "./ws.js";

// The DB-backed session lookup is the boundary here; everything else in the
// /ws handler (listener wiring, ping interval, teardown) runs for real.
vi.mock("../lib/auth.js", () => ({
  getSessionToken: () => "tok-1",
  resolveActor: () => pendingAuth.promise,
}));

type Actor = { type: "extension"; id: string; number: string; name: string };

const pendingAuth: {
  promise: Promise<Actor | null>;
  resolve: (actor: Actor | null) => void;
} = { promise: Promise.resolve(null), resolve: () => undefined };

function deferAuth(actor: Actor | null) {
  let resolve!: (actor: Actor | null) => void;
  pendingAuth.promise = new Promise<Actor | null>((res) => {
    resolve = res;
  });
  pendingAuth.resolve = resolve;
  return () => resolve(actor);
}

const EXT_ACTOR: Actor = { type: "extension", id: "dev-1", number: "101", name: "Test" };

let app: Fastify.FastifyInstance | undefined;

/** Ephemeral-port server running the real /ws route. */
async function startServer(): Promise<string> {
  app = Fastify({ logger: false });
  await app.register(websocket);
  await app.register(wsRoutes);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address();
  if (!addr || typeof addr === "string") throw new Error("no server address");
  return `ws://127.0.0.1:${addr.port}/ws`;
}

/** Opens a client, hands it to the test, and closes it from the client side. */
async function withClient(
  url: string,
  fn: (ws: WebSocket, waitMessage: () => Promise<string>) => Promise<void>,
): Promise<void> {
  const client = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    client.once("open", resolve);
    client.once("error", reject);
  });
  // Created up front: a test that closes the client itself must not hang on a
  // second "close" listener registered after the event already fired.
  const closed = new Promise<void>((resolve) => client.once("close", resolve));
  const waitMessage = () =>
    new Promise<string>((resolve, reject) => {
      client.once("message", (raw) => resolve(String(raw)));
      client.once("close", () => reject(new Error("connection closed before message")));
    });
  try {
    await fn(client, waitMessage);
  } finally {
    client.close(); // no-op when the test already closed it
    await closed;
  }
}

/** All bus listeners the /ws handler must own and remove on disconnect. */
function listenerSnapshot(): number[] {
  return [
    ari.listenerCount("calls"),
    ari.listenerCount("extension.state"),
    ari.listenerCount("trunk.state"),
    ari.listenerCount("queue.update"),
    ari.listenerCount("alert"),
    liveEvents.listenerCount("voicemail.new"),
    liveEvents.listenerCount("missed.new"),
  ];
}

async function expectSnapshotBack(baseline: number[]) {
  await vi.waitFor(
    () => {
      const now = listenerSnapshot();
      expect(now, `bus listeners must be removed after disconnect (got ${now.join(",")})`).toEqual(
        baseline,
      );
    },
    { timeout: 2000, interval: 20 },
  );
}

describe("GET /ws teardown", () => {
  let url: string;

  beforeEach(async () => {
    url = await startServer();
  });

  afterEach(async () => {
    if (app) await app.close();
    vi.restoreAllMocks();
  });

  it("removes its bus listeners after a normal disconnect", async () => {
    const baseline = listenerSnapshot();
    const releaseAuth = deferAuth(EXT_ACTOR);
    await withClient(url, async (_client, waitMessage) => {
      releaseAuth();
      const hello = await waitMessage();
      expect(hello).toContain('"hello"');
    });
    await expectSnapshotBack(baseline);
  });

  it("leaves no bus listeners when the socket dies while auth is in flight", async () => {
    const baseline = listenerSnapshot();
    const releaseAuth = deferAuth(EXT_ACTOR);
    // Drive the REAL /ws handler with a simulated socket so the ordering is
    // exact: the transport dies BEFORE the auth lookup resolves, and nothing
    // can re-fire "close" afterwards. Over TCP the server-side close event
    // races the auth continuation, which made the defect invisible.
    const captured: Array<(socket: unknown, req: unknown) => void> = [];
    const fakeApp = {
      get: (_path: unknown, _opts: unknown, handler: (socket: unknown, req: unknown) => void) =>
        captured.push(handler),
    };
    await wsRoutes(fakeApp as never);
    expect(captured, "/ws handler must be registered").toHaveLength(1);

    const socket = new EventEmitter() as EventEmitter & { send: () => void; close: () => void };
    socket.send = () => undefined;
    socket.close = () => undefined;
    captured[0]!(socket, { cookies: {}, headers: {} }); // auth pending
    socket.emit("close"); // transport died mid-auth
    releaseAuth(); // auth resolves AFTER the socket is gone
    // Flush the handler's continuation microtasks BEFORE asserting: the first
    // waitFor poll runs synchronously and must not observe the pre-registration
    // state (that would be a false pass).
    await new Promise((r) => setTimeout(r, 20));
    await vi.waitFor(
      () => {
        const now = listenerSnapshot();
        expect(now, `bus listeners must not be registered for a dead socket (got ${now.join(",")})`).toEqual(
          baseline,
        );
      },
      { timeout: 2000, interval: 20 },
    );
  });

  it("registers nothing and stays clean for an unauthenticated socket", async () => {
    const baseline = listenerSnapshot();
    const releaseAuth = deferAuth(null);
    await withClient(url, async (_client, waitMessage) => {
      releaseAuth();
      const msg = await waitMessage();
      expect(msg).toContain('"error"');
    });
    expect(listenerSnapshot()).toEqual(baseline);
  });
});
