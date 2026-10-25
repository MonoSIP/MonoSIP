import type { FastifyInstance } from "fastify";
import { ari } from "../asterisk/ari.js";
import { getSessionToken, resolveActor } from "../lib/auth.js";
import { liveEvents } from "../lib/live-events.js";

export async function wsRoutes(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, req) => {
    let closed = false;
    const send = (type: string, payload: unknown) => {
      if (closed) return;
      try {
        socket.send(JSON.stringify({ type, payload, at: new Date().toISOString() }));
      } catch {
        /* ignore */
      }
    };

    // A client that disconnects while auth is still awaiting has already fired
    // "close": listeners and timers registered after resolveActor() would then
    // never see it and would leak for the life of the process (one /ws connect
    // + quick disconnect = one permanent listener set + ping interval). All
    // teardown therefore goes through one hook, installed before the first
    // await; the auth continuation bails out when the socket died meanwhile.
    let tick: ReturnType<typeof setInterval> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let teardown: () => void = () => {
      closed = true;
    };
    socket.on("close", () => teardown());

    // A rejection here (resolveActor hitting a down database) would be an
    // unhandled rejection, which is fatal and would take the whole API down.
    // An unauthenticated client must not be able to trigger that.
    void (async () => {
      const actor = await resolveActor(getSessionToken(req));
      if (closed) return; // socket died during auth — nothing was registered
      if (!actor) {
        send("error", { message: "Unauthorized" });
        socket.close();
        return;
      }
      send("hello", { role: actor.type });

      const onCalls = (calls: unknown) => {
        if (actor.type === "admin") send("call.update", calls);
      };
      const onExt = (state: unknown) => {
        send("extension.state", state);
        if (actor.type !== "admin") send("presence.update", state);
      };
      const onTrunk = (payload: unknown) => {
        if (actor.type === "admin") send("trunk.state", payload);
      };
      const onQueue = (payload: unknown) => {
        if (actor.type === "admin") send("queue.update", payload);
      };
      const onAlert = (payload: unknown) => {
        if (actor.type === "admin") send("alert", payload);
      };
      const onVm = (payload: unknown) => {
        if (actor.type !== "admin") {
          const p = payload as { extension?: string };
          const mine =
            actor.type === "extension" &&
            (actor as { number?: string }).number &&
            p.extension === (actor as { number: string }).number;
          if (mine) send("voicemail.new", payload);
        }
      };
      const onMissed = (payload: unknown) => {
        if (actor.type !== "admin") {
          const p = payload as { target?: string };
          const mine =
            actor.type === "extension" &&
            (actor as { number?: string }).number &&
            p.target === (actor as { number: string }).number;
          if (mine) send("missed.new", payload);
        }
      };

      ari.on("calls", onCalls);
      ari.on("extension.state", onExt);
      ari.on("trunk.state", onTrunk);
      ari.on("queue.update", onQueue);
      ari.on("alert", onAlert);
      liveEvents.on("voicemail.new", onVm);
      liveEvents.on("missed.new", onMissed);

      // Periodic trunk/queue snapshot for live pano (AMI)
      if (actor.type === "admin") {
        const pushLive = () => {
          void (async () => {
            try {
              const { db } = await import("../db/client.js");
              const { trunks, queues } = await import("../db/schema.js");
              const { fetchTrunkEndpointStatus, fetchQueueWaiting } = await import("../lib/ami.js");
              const trks = await db.select().from(trunks);
              for (const t of trks.slice(0, 8)) {
                const endpoint = `trunk_${t.id.slice(0, 8)}`;
                const live = await fetchTrunkEndpointStatus(endpoint);
                send("trunk.state", { id: t.id, name: t.name, status: live.status });
              }
              const qs = await db.select().from(queues);
              for (const q of qs.slice(0, 12)) {
                const waiting = await fetchQueueWaiting(q.number);
                send("queue.update", { number: q.number, name: q.name, waiting });
              }
            } catch {
              /* ignore */
            }
          })();
        };
        pushLive();
        tick = setInterval(pushLive, 20000);
      }

      ping = setInterval(() => send("ping", {}), 15000);

      teardown = () => {
        closed = true;
        clearInterval(ping);
        if (tick) clearInterval(tick);
        ari.off("calls", onCalls);
        ari.off("extension.state", onExt);
        ari.off("trunk.state", onTrunk);
        ari.off("queue.update", onQueue);
        ari.off("alert", onAlert);
        liveEvents.off("voicemail.new", onVm);
        liveEvents.off("missed.new", onMissed);
      };
    })().catch((e) => {
      console.warn("[ws] handler failed:", (e as Error).message);
      try {
        socket.close();
      } catch {
        /* already closed */
      }
    });
  });
}
