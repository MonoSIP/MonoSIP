import type { FastifyInstance } from "fastify";
import { stat } from "node:fs/promises";
import { requireAdmin } from "../lib/auth.js";
import { consumeLines, followAppends, readTail } from "../lib/log-tail.js";

/** Logger files, richest first. `console.log` is the foreground log from the all-in-one script. */
const LOG_FILES = process.env.ASTERISK_LOG_FILE
  ? [process.env.ASTERISK_LOG_FILE]
  : ["/var/log/asterisk/full", "/var/log/asterisk/messages", "/var/log/asterisk/console.log"];
const TAIL_LINES = 200;
const TAIL_BYTES = 64 * 1024;

async function resolveLog(): Promise<string | null> {
  for (const file of LOG_FILES) {
    try {
      if ((await stat(file)).isFile()) return file;
    } catch {
      /* try the next file */
    }
  }
  return null;
}

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
    raw.socket?.setNoDelay(true);
    raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    // Some proxies hold the first small chunk. A comment forces the flush.
    raw.write(`:${" ".repeat(2048)}\n\n`);

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
    let look: ReturnType<typeof setInterval> | undefined;
    const beat = setInterval(() => {
      if (!closed && !raw.writableEnded) raw.write(": ping\n\n");
    }, 15_000);

    const follow = async (file: string) => {
      const tail = await readTail(file, TAIL_LINES, TAIL_BYTES);
      if (closed || tail == null) return;
      send("meta", JSON.stringify({ state: "open" }));
      for (const line of tail.lines) send("line", line);
      if (closed) return;
      stop = followAppends(file, tail.size, push);
    };

    const arm = async () => {
      const file = await resolveLog();
      if (closed) return;
      if (!file) {
        send("meta", JSON.stringify({ state: "missing" }));
        look = setInterval(() => {
          void resolveLog().then((found) => {
            if (!found || closed) return;
            clearInterval(look);
            look = undefined;
            void follow(found);
          });
        }, 1000);
        return;
      }
      await follow(file);
    };

    const done = () => {
      closed = true;
      clearInterval(beat);
      if (look) clearInterval(look);
      stop();
      if (!raw.writableEnded) raw.end();
    };
    req.raw.on("close", done);
    void arm().catch(() => {
      if (!closed) send("meta", JSON.stringify({ state: "missing" }));
    });
  });
}
