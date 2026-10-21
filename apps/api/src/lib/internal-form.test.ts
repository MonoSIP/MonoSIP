import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ db: {} }));

import { config } from "../config.js";
import { internalPost } from "../asterisk/config-writer.js";
import { requireInternalSecret } from "./internal-auth.js";
import { registerInternalFormParser } from "./internal-form.js";

async function hookApp() {
  const app = Fastify();
  registerInternalFormParser(app);
  app.post("/api/v1/internal/cdr", async (req, reply) => {
    if (!requireInternalSecret(req, reply)) return;
    return { got: req.body };
  });
  app.post("/api/v1/public/form", async (req) => ({ got: req.body }));
  return app;
}

/** What func_curl sends for internalPost(): secret + URI-encoded JSON payload. */
const form = (secret: string, json: string) =>
  `secret=${secret}&payload=${encodeURIComponent(json)}`;

describe("internal hook form parser", () => {
  it("turns the URI-encoded payload back into the JSON body and authenticates the secret", async () => {
    const app = await hookApp();
    const json = '{"callId":"1792.5","caller":"101","billsec":12,"mos":"4.3"}';
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/cdr",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form(config.internalApiSecret, json),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().got).toEqual(JSON.parse(json));
  });

  it("rejects a wrong secret", async () => {
    const app = await hookApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/cdr",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form("wrong", "{}"),
    });
    expect(res.statusCode).toBe(401);
  });

  it("answers 400 for a malformed payload (e.g. an empty numeric dialplan var)", async () => {
    const app = await hookApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/internal/cdr",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: form(config.internalApiSecret, '{"billsec":,"x":1}'),
    });
    expect(res.statusCode).toBe(400);
  });

  it("leaves non-internal form posts as plain fields", async () => {
    const app = await hookApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/public/form",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "a=1&secret=x",
    });
    expect(res.json().got).toEqual({ a: "1", secret: "x" });
  });
});

describe("internalPost dialplan", () => {
  it("posts in-process with CURL (no System fork) to the internal API URL", () => {
    const line = internalPost("cdr", '{"callId":"${UNIQUEID}","billsec":${MUNASIP_BILL}}');
    expect(line).not.toMatch(/System\(|SHELL\(/);
    expect(line).toContain(`\${CURL(${config.internalApiUrl}/api/v1/internal/cdr,`);
    // The JSON is URIENCODE()d inside CURL so its commas never split CURL's arguments.
    expect(line).toContain('payload=${URIENCODE({"callId":"${UNIQUEID}","billsec":${MUNASIP_BILL}})}');
  });

  it("targets 127.0.0.1 when Asterisk is embedded (no `api` host in the all-in-one image)", () => {
    expect(config.internalApiUrl).toMatch(/^http:\/\/(127\.0\.0\.1:\d+|api:3000)$/);
    if (/127\.0\.0\.1|localhost/.test(config.asterisk.ariUrl)) {
      expect(config.internalApiUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
    }
  });
});
