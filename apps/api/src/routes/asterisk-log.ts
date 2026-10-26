import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../lib/auth.js";
import { consumeLines, followAppends, readTail } from "../lib/log-tail.js";

/** Verbose channel: notice, warning, error, and verbose. Shared read-only with the API. */
const LOG_FILE = process.env.ASTERISK_LOG_FILE ?? "/var/log/asterisk/full";
const TAIL_LINES = 200;
const TAIL_BYTES = 64 * 1024;

/**
 * Live Asterisk log for the reports screen. Admin cookie only.
 * Recent lines first, then each new line as it is appended.
 */
export function asteriskLogRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/reports/asterisk-log", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor || actor.type !== "admin") return;

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: string, data: string) => {
      if (raw.writableEnded) return;
      raw.write(`event: ${event}\ndata: ${data.replace(/\r/g, "")}\n\n`);
    };

    let pending = "";
    let closed = false;
    const push = (chunk: string) => {
      if (closed) return;
      const next = consumeLines(pending, chunk);
      pending = next.pending;
      for (const line of next.lines) send("line", line);
    };

    let stop = () => {};
    const beat = setInterval(() => {
      if (!closed && !raw.writableEnded) raw.write(": ping\n\n");
    }, 15_000);

    const arm = async () => {
      const tail = await readTail(LOG_FILE, TAIL_LINES, TAIL_BYTES);
      if (closed) return;
      if (tail == null) {
        send("meta", JSON.stringify({ state: "missing" }));
        stop = followAppends(LOG_FILE, 0, push);
        return;
      }
      send("meta", JSON.stringify({ state: "open" }));
      for (const line of tail.lines) send("line", line);
      if (closed) return;
      stop = followAppends(LOG_FILE, tail.size, push);
    };

    const done = () => {
      closed = true;
      clearInterval(beat);
      stop();
      if (!raw.writableEnded) raw.end();
    };
    req.raw.on("close", done);
    void arm().catch(() => {
      send("meta", JSON.stringify({ state: "missing" }));
    });
  });
}
