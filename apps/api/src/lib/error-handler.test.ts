import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { sendApiError } from "./error-handler.js";

/**
 * Locks the public error contract across the zod 3 -> 4 upgrade: validation
 * failures keep `details.issues` as an array (zod 4 would otherwise serialize it
 * as a JSON string under `details.message`), and 500s never leak error text.
 */
async function appWith(handler: () => unknown) {
  const app = Fastify();
  const logged: unknown[] = [];
  app.setErrorHandler((err, _req, reply) => sendApiError(err, reply, (e) => logged.push(e)));
  app.post("/t", async () => handler());
  await app.ready();
  return { app, logged };
}

describe("sendApiError", () => {
  it("returns 400 with details.issues as an array for a real zod error", async () => {
    const { app } = await appWith(() => z.object({ url: z.string().url() }).parse({ url: "nope" }));
    const res = await app.inject({ method: "POST", url: "/t" });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.name).toBe("ZodError");
    expect(Array.isArray(body.details.issues)).toBe(true);
    expect(body.details.issues[0].path).toEqual(["url"]);
  });

  it("returns a generic 500 and logs the real error", async () => {
    const { app, logged } = await appWith(() => {
      throw new Error("db password=hunter2 at /etc/secret");
    });
    const res = await app.inject({ method: "POST", url: "/t" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Internal error" });
    expect(res.body).not.toContain("hunter2");
    expect(logged).toHaveLength(1);
  });
});
