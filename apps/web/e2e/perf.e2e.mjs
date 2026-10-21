/**
 * Front-end performance probe: loads key admin and portal pages from a running
 * DSip (production build) in a fresh browser and reports, per page, the JS / CSS
 * downloaded, FCP, LCP, long tasks (main-thread blocking), CLS and the time until
 * the page's data has arrived (the loading veil is gone).
 *
 * Run: BASE_URL=http://localhost:3000 node apps/web/e2e/perf.e2e.mjs [--cpu=4]
 * Env: ADMIN_EMAIL / ADMIN_PASSWORD, PORTAL_EXT / PORTAL_PASS (default 101 / portal101).
 */
import { chromium } from "playwright";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const CPU = Number((process.argv.find((a) => a.startsWith("--cpu=")) ?? "--cpu=4").split("=")[1]);

const OBSERVE = () => {
  window.__perf = { lcp: 0, cls: 0, longTasks: 0, blocking: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__perf.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      window.__perf.longTasks += 1;
      window.__perf.blocking += Math.max(0, e.duration - 50);
    }
  }).observe({ type: "longtask", buffered: true });
};

async function measure(browser, login, path) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(OBSERVE);
  await login(ctx);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  const bytes = { js: 0, css: 0, api: 0 };
  let apiCalls = 0;
  cdp.on("Network.loadingFinished", () => undefined);
  page.on("response", async (r) => {
    const u = r.url();
    // bytes on the wire: content-length is the compressed size when the server compresses
    const len = Number(r.headers()["content-length"] ?? 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
    if (u.endsWith(".js")) bytes.js += len;
    else if (u.endsWith(".css")) bytes.css += len;
    else if (u.includes("/api/")) {
      bytes.api += len;
      apiCalls += 1;
    }
  });
  const t0 = Date.now();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => !document.querySelector(".page-veil.is-loading") && document.querySelector("#root")?.childElementCount,
    null,
    { timeout: 30000 },
  );
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const ready = Date.now() - t0;
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    return { fcp, ...window.__perf };
  });
  await ctx.close();
  return { path, ready, fcp: Math.round(m.fcp), lcp: Math.round(m.lcp), blocking: Math.round(m.blocking), longTasks: m.longTasks, cls: +m.cls.toFixed(3), jsKB: Math.round(bytes.js / 1024), cssKB: Math.round(bytes.css / 1024), apiCalls };
}

const browser = await chromium.launch({ headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const admin = async (ctx) => {
  await ctx.request.post(`${BASE}/api/v1/admin/auth/login`, { data: { email: process.env.ADMIN_EMAIL ?? "admin@example.com", password: process.env.ADMIN_PASSWORD ?? "Admin123!" } });
};
const portal = async (ctx) => {
  await ctx.grantPermissions(["microphone"]);
  await ctx.request.post(`${BASE}/api/v1/auth/login`, { data: { extension: process.env.PORTAL_EXT ?? "101", password: process.env.PORTAL_PASS ?? "portal101" } });
};
const none = async () => undefined;

const flows = await (async () => {
  const ctx = await browser.newContext();
  await admin(ctx);
  const r = await (await ctx.request.get(`${BASE}/api/v1/admin/flows`)).json();
  await ctx.close();
  return r;
})();

const rows = [];
for (const [who, path] of [
  [none, "/login"],
  [admin, "/"],
  [admin, "/extensions"],
  [admin, "/cdr"],
  [admin, "/reports"],
  [admin, `/flows/${flows[0]?.id}`],
  [admin, "/settings"],
  [portal, "/portal/phone"],
  [portal, "/portal/directory"],
]) {
  rows.push(await measure(browser, who, path));
}
await browser.close();
console.log(`CPU throttle ×${CPU}`);
console.table(rows.map((r) => ({ ...r, path: r.path.replace(/flows\/[0-9a-f-]+/, "flows/:id") })));
