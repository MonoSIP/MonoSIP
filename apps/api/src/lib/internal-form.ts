import type { FastifyInstance } from "fastify";

/**
 * Dialplan hooks arrive from Asterisk func_curl as a form post
 * (`secret=…&payload=<URI-encoded JSON>`, see internalPost in config-writer.ts).
 * For /api/v1/internal/* the payload becomes the JSON body and the secret becomes
 * the x-munasip-internal header, so the hook routes stay unchanged. Other routes get
 * the plain form fields.
 */
export function registerInternalFormParser(app: FastifyInstance): void {
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (req, body, done) => {
      const params = new URLSearchParams(String(body));
      if (!req.url.startsWith("/api/v1/internal/")) {
        done(null, Object.fromEntries(params));
        return;
      }
      const secret = params.get("secret");
      if (secret && !req.headers["x-munasip-internal"]) req.headers["x-munasip-internal"] = secret;
      const payload = params.get("payload");
      if (payload === null) {
        done(null, Object.fromEntries(params));
        return;
      }
      try {
        done(null, JSON.parse(payload));
      } catch {
        const err = new Error("Invalid hook payload JSON") as Error & { statusCode: number };
        err.statusCode = 400;
        done(err, undefined);
      }
    },
  );
}
