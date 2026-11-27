import { LogController, type FastifyReply, type FastifyRequest } from "fastify";

/**
 * Which HTTP requests belong in the access log.
 * Health probes and static SPA assets are quiet unless they fail.
 */
export function shouldLogHttpAccess(url: string, statusCode: number): boolean {
  if (statusCode >= 400) return true;
  return !isQuietAccessPath(url);
}

function isQuietAccessPath(url: string): boolean {
  const path = (url.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  if (path === "/api/v1/health") return true;
  if (path.startsWith("/assets/")) return true;
  if (/\.(js|css|map|svg|png|ico|webp|woff2?|br|gz)$/i.test(path)) return true;
  if (path === "/") return true;
  return false;
}

/** Fastify 5+ LogController: suppress asset/health noise; keep failures + API traffic. */
export class QuietAccessLogController extends LogController {
  constructor() {
    super({ disableRequestLogging: false });
  }

  override incomingRequest(request: FastifyRequest, _reply: FastifyReply): void {
    if (isQuietAccessPath(request.url)) return;
    request.log.info({ req: request }, "incoming request");
  }

  override requestCompleted(
    error: Error | null | undefined,
    request: FastifyRequest,
    reply: FastifyReply,
  ): void {
    if (!shouldLogHttpAccess(request.url, reply.statusCode) && !error) return;
    if (error) {
      reply.log.error(
        { res: reply, err: error, responseTime: reply.elapsedTime },
        "request errored",
      );
    } else {
      reply.log.info({ res: reply, responseTime: reply.elapsedTime }, "request completed");
    }
  }
}
