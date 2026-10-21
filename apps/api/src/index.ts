import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { ari } from "./asterisk/ari.js";
import { attachFlowRuntime } from "./asterisk/flow-runtime.js";
import { authRoutes } from "./routes/auth.js";
import { adminExtensionRoutes } from "./routes/admin-extensions.js";
import { adminResourceRoutes } from "./routes/admin-resources.js";
import { portalRoutes } from "./routes/portal.js";
import { integrationRoutes } from "./routes/integration.js";
import { wsRoutes } from "./routes/ws.js";
import { asteriskWsProxyRoutes } from "./routes/asterisk-ws-proxy.js";

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
  const { registerInternalFormParser } = await import("./lib/internal-form.js");
  registerInternalFormParser(app);

  app.setErrorHandler((err, _req, reply) => {
    const error = err as Error & { name?: string };
    if (error.name === "ZodError") {
      return reply.code(400).send({ error: "Validation failed", details: err });
    }
    app.log.error(err);
    return reply.code(500).send({ error: error.message ?? "Internal error" });
  });

  app.addHook("onRequest", async (req, reply) => {
    const { adoptPublicIdentityFromHost } = await import("./lib/public-identity.js");
    const xfHost = req.headers["x-forwarded-host"];
    const forwarded = Array.isArray(xfHost) ? xfHost[0] : xfHost;
    adoptPublicIdentityFromHost(forwarded || req.hostname);

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
  const { widgetRoutes } = await import("./routes/widgets.js");
  await widgetRoutes(app);
  await wsRoutes(app);
  await asteriskWsProxyRoutes(app);

  attachFlowRuntime();
  await ari.start();

  // Sync PJSIP secrets + dialplan on boot (seed may have raced empty conf / bad perms).
  void import("./asterisk/config-writer.js")
    .then(({ writeAsteriskConfig }) => writeAsteriskConfig())
    .catch((e) => console.warn("[boot] asterisk config:", (e as Error).message));

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
  // Ban addresses that brute-force SIP (AMI security events → SIP ACL deny)
  const { startSipGuard } = await import("./lib/sip-guard.js");
  startSipGuard();
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

  // Drop expired live IVR TTS cache rows (+ WAV files)
  void import("./lib/tts.js")
    .then(({ purgeExpiredTtsCache }) => purgeExpiredTtsCache(true))
    .catch((e) => console.warn("[tts-cache]", (e as Error).message));

  // Warm the neural TTS models: the first synth after boot loads them (~25 s),
  // which the first caller after a deploy would otherwise hear as silence.
  void (async () => {
    const { synthesizeSpeech } = await import("./lib/tts.js");
    for (const [text, lang, voice] of [
      ["Merhaba.", "tr", "ema-lightning"],
    ] as const) {
      const t0 = Date.now();
      await synthesizeSpeech(text, lang, 1.05, voice)
        .then(() => console.log(`[tts] warm ${voice} ${Date.now() - t0}ms`))
        .catch((e) => console.warn(`[tts] warm ${voice} skipped:`, (e as Error).message));
    }
  })();

  // NineDeploy / single-container: serve the Vite SPA next to the API.
  const webDist =
    process.env.WEB_DIST?.trim() ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(path.join(webDist, "index.html"))) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
      // dist/ ships .br / .gz next to each asset (apps/web/scripts/precompress.mjs)
      preCompressed: true,
      // Cache-Control is set below; the plugin's own "max-age=0" overwrote it.
      cacheControl: false,
      setHeaders: (res, filePath) => {
        // Hashed Vite chunks never change; index.html must always be revalidated
        // so a redeploy doesn't leave tabs pointing at deleted chunk hashes.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const u = (req.url.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
      if (
        req.method === "GET" &&
        // Missing files (e.g. stale chunk hashes after a deploy) must 404, not get index.html.
        !u.startsWith("/assets/") &&
        !/\.[a-z0-9]+$/i.test(u) &&
        !u.startsWith("/api") &&
        !u.startsWith("/ws") &&
        !u.startsWith("/asterisk-ws") &&
        !u.startsWith("/.well-known")
      ) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({
        message: `Route ${req.method}:${u} not found`,
        error: "Not Found",
        statusCode: 404,
      });
    });
    app.log.info(`Serving web UI from ${webDist}`);
  } else {
    app.log.warn(`Web UI not found at ${webDist} — only API routes available`);
  }

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`DSip API listening on :${config.port}`);

  // NineDeploy logs: tell operators softphone needs host UDP RTP (no port-forward expertise assumed).
  void import("./lib/media-readiness.js")
    .then(async ({ getMediaReadiness, formatMediaDeployBanner }) => {
      const media = await getMediaReadiness();
      const banner = formatMediaDeployBanner(media);
      for (const line of banner.split("\n")) {
        if (line.length) console.log(line);
      }
    })
    .catch((e) => console.warn("[media]", (e as Error).message));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
