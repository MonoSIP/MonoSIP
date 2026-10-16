import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

/** Validate X-DSip-Internal header from dialplan curls. */
export function requireInternalSecret(req: FastifyRequest, reply: FastifyReply): boolean {
  const hdr =
    (req.headers["x-dsip-internal"] as string | undefined) ??
    (req.headers["x-internal-secret"] as string | undefined);
  if (!hdr || hdr !== config.internalApiSecret) {
    void reply.code(401).send({ error: "Unauthorized internal hook" });
    return false;
  }
  return true;
}
