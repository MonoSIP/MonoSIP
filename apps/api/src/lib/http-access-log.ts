/**
 * Which HTTP requests belong in the access log.
 * Health probes and static SPA assets are quiet unless they fail.
 */
export function shouldLogHttpAccess(url: string, statusCode: number): boolean {
  if (statusCode >= 400) return true;
  const path = (url.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
  if (path === "/api/v1/health") return false;
  if (path.startsWith("/assets/")) return false;
  if (/\.(js|css|map|svg|png|ico|webp|woff2?|br|gz)$/i.test(path)) return false;
  if (path === "/") return false;
  return true;
}
