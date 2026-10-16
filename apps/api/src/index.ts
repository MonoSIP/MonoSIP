import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { mkdir } from "node:fs/promises";
import { config } from "./config.js";
import { ari } from "./asterisk/ari.js";
import { attachFlowRuntime } from "./asterisk/flow-runtime.js";
import { authRoutes } from "./routes/auth.js";
import { adminExtensionRoutes } from "./routes/admin-extensions.js";
import { adminResourceRoutes } from "./routes/admin-resources.js";
import { portalRoutes } from "./routes/portal.js";
import { integrationRoutes } from "./routes/integration.js";
import { wsRoutes } from "./routes/ws.js";

async function main() {
  await mkdir(config.recordingsDir, { recursive: true });
  await mkdir(config.uploadsDir, { recursive: true });
  await mkdir(config.asterisk.configDir, { recursive: true });

  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(cookie, {
    secret: config.sessionSecret,
  });
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });
  await app.register(websocket);

  app.setErrorHandler((err, _req, reply) => {
    const error = err as Error & { name?: string };
    if (error.name === "ZodError") {
      return reply.code(400).send({ error: "Validation failed", details: err });
    }
    app.log.error(err);
    return reply.code(500).send({ error: error.message ?? "Internal error" });
  });

  app.addHook("onRequest", async (req, reply) => {
    const { enforceAdminIpAccess } = await import("./lib/admin-ip-guard.js");
    const ok = await enforceAdminIpAccess(req, reply);
    if (!ok) return;
  });

  // Let's Encrypt HTTP-01 (proxied from nginx :80) — public, no auth
  app.get("/.well-known/acme-challenge/:token", async (req, reply) => {
    const { getHttp01Challenge } = await import("./lib/ssl-certs.js");
    const { token } = req.params as { token: string };
    const body = getHttp01Challenge(token);
    if (!body) return reply.code(404).send("not found");
    return reply.type("text/plain").send(body);
  });

  await authRoutes(app);
  await adminExtensionRoutes(app);
  await adminResourceRoutes(app);
  const { securityRoutes } = await import("./routes/security.js");
  await securityRoutes(app);
  await portalRoutes(app);
  await integrationRoutes(app);
  await wsRoutes(app);

  attachFlowRuntime();
  await ari.start();

  const { startRetentionJob } = await import("./jobs/retention.js");
  startRetentionJob();
  // Drop legacy empty / 0s recording rows once at boot
  void import("./lib/recording-files.js")
    .then(({ purgeZeroSecondRecordings }) => purgeZeroSecondRecordings())
    .catch((e) => console.warn("[recording] purge", (e as Error).message));
  const { startQueueCallbackJob } = await import("./jobs/queue-callback.js");
  startQueueCallbackJob();
  const { startSummaryEmailJob } = await import("./jobs/summary-email.js");
  startSummaryEmailJob();
  const { startArchiveJob } = await import("./jobs/archive.js");
  startArchiveJob();
  const { startOpusConvertJob } = await import("./jobs/opus-convert.js");
  startOpusConvertJob();
  const { startTrunkMonitorJob } = await import("./jobs/trunk-monitor.js");
  startTrunkMonitorJob();
  const { startNightlyBackupJob } = await import("./jobs/nightly-backup.js");
  startNightlyBackupJob();
  const { startSslRenewJob } = await import("./jobs/ssl-renew.js");
  startSslRenewJob();

  // Pre-generate queue position TTS (MOH ducks during announce) — non-blocking
  void import("./lib/queue-announce-tts.js")
    .then(({ ensureQueueAnnounceSounds }) => ensureQueueAnnounceSounds())
    .catch((e) => console.warn("[queue-tts]", (e as Error).message));

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`DSip API listening on :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
