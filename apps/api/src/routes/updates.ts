import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../lib/auth.js";
import { getUpdateStatus } from "../lib/update-check.js";

export async function updateRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/updates", async (req, reply) => {
    const actor = await requireAdmin(req, reply);
    if (!actor) return;
    return getUpdateStatus();
  });
}
