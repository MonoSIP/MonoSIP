import type { FastifyReply } from "fastify";

/**
 * Shared Fastify error handler (prod server and test harness use the same one,
 * so the integration suite exercises the real response contract).
 *
 * Validation errors: 400 `{ error: "Validation failed", details: { issues, name } }`.
 * The `details` structure is built explicitly so it stays the same across zod
 * versions — zod 3 serialized a ZodError as `{ issues, name }`, zod 4 as
 * `{ name, message: "<issues JSON string>" }`, which would have silently dropped
 * `details.issues` for API clients.
 *
 * Everything else: 500 with a generic message; the detail goes to the log only.
 */
export function sendApiError(
  err: unknown,
  reply: FastifyReply,
  log: (e: unknown) => void,
): FastifyReply {
  const error = err as Error & { name?: string; issues?: unknown[] };
  if (error?.name === "ZodError") {
    return reply
      .code(400)
      .send({ error: "Validation failed", details: { issues: error.issues ?? [], name: "ZodError" } });
  }
  log(err);
  return reply.code(500).send({ error: "Internal error" });
}
