/**
 * FlowDesignerPage real-browser e2e (Playwright + Vite dev server).
 * Run: pnpm --filter @munasip/web test:e2e
 *
 * Covers what jsdom cannot: the designer toolbar renders (React Flow canvas),
 * and the Save / Validate / Publish flows issue their API contracts with the
 * expected toasts. All /api/v1 traffic is intercepted, so no backend is needed.
 *
 * Fixture contract note: the page reads the draft as
 *   { name, extensionNumber, draftJson: { nodes, edges } }
 * — a bare { nodes, edges } makes `f.draftJson` undefined, the page's own
 * `.catch` swallows the throw, and the content pane stays on Loading forever.
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(webRoot, "e2e", "artifacts");

// Vite is managed programmatically (createServer/close) so the run can never
// orphan a dev server process.
const server = await createServer({
  root: webRoot,
  logLevel: "error",
  server: { port: 5174, strictPort: true },
});
await server.listen();
const base = server.resolvedUrls?.local?.[0]?.replace(/\/$/, "") ?? "http://localhost:5174";

const calls = [];
const pageErrors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => pageErrors.push(String(e)));

try {
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const method = req.method();
    const p = new URL(req.url()).pathname;
    calls.push(`${method} ${p}`);
    const fulfill = (body) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (method === "GET" && p === "/api/v1/auth/me")
      return fulfill({ actor: { type: "admin", id: "a1", email: "admin@example.com" } });
    if (method === "GET" && p === "/api/v1/admin/flows/f1/draft")
      return fulfill({ name: "Main IVR", extensionNumber: null, draftJson: { nodes: [], edges: [] } });
    if (method === "GET" && p === "/api/v1/admin/flows/f1/versions")
      return fulfill([{ id: "v1", version: 1, publishedAt: "2026-01-01T00:00:00Z" }]);
    if (method === "GET" && p === "/api/v1/admin/flows") return fulfill([{ id: "f1", name: "Main IVR" }]);
    if (method === "PATCH" && p === "/api/v1/admin/flows/f1") return fulfill({});
    if (method === "PUT" && p === "/api/v1/admin/flows/f1/draft") return fulfill({});
    if (method === "POST" && p === "/api/v1/admin/flows/f1/validate") return fulfill({ ok: true, errors: [] });
    if (method === "POST" && p === "/api/v1/admin/flows/f1/publish") return fulfill({ version: 2 });
    if (p.includes("/admin/queues") || p.includes("/admin/extensions") ||
        p.includes("/admin/schedules") || p.includes("/admin/secrets") ||
        p.includes("/admin/prompts") || p.includes("/admin/moh")) return fulfill([]);
    return fulfill({ ok: true });
  });

  await page.goto(`${base}/flows/f1`, { waitUntil: "networkidle" });
  // Cold Vite discovers deps during the first load and hard-reloads the SPA,
  // which would swallow an in-flight interaction. Reload once so the flow
  // always runs against a warm page.
  await page.reload({ waitUntil: "networkidle" });

  // The designer toolbar renders in a real browser — jsdom cannot do this.
  await page.getByRole("button", { name: "Save", exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  if (!(await page.locator(".react-flow").first().isVisible())) throw new Error("React Flow canvas not visible");

  // Save -> PATCH metadata + PUT draft graph.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().endsWith("/api/v1/admin/flows/f1"));
  await page.waitForResponse((r) => r.request().method() === "PUT" && r.url().endsWith("/api/v1/admin/flows/f1/draft"));

  // Validate -> POST validate + "Valid" toast.
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/flows/f1/validate"));
  await page.getByText("Valid", { exact: true }).waitFor({ state: "visible", timeout: 5_000 });

  // Publish -> save() first, then POST publish + "Published v2" + versions refetch.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/flows/f1/publish"));
  await page.getByText("Published v2").waitFor({ state: "visible", timeout: 5_000 });

  // Canvas interactions: add two nodes via the palette, connect them, delete one.
  await page.getByRole("button", { name: "announce", exact: true }).click();
  await page.getByRole("button", { name: "hangup", exact: true }).click();
  await page.locator(".react-flow__node").first().waitFor({ state: "visible" });
  if ((await page.locator(".react-flow__node").count()) !== 2)
    throw new Error(`expected 2 canvas nodes after palette adds`);

  // Drag the second node clear of the first (addNode stacks them with overlap).
  const node2 = page.locator(".react-flow__node").nth(1);
  const n2 = await node2.boundingBox();
  if (!n2) throw new Error("second node not found");
  await page.mouse.move(n2.x + n2.width / 2, n2.y + n2.height / 2);
  await page.mouse.down();
  await page.mouse.move(520, 340, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    () => {
      const n = document.querySelectorAll(".react-flow__node")[1];
      const r = n?.getBoundingClientRect();
      return r && r.x > 400;
    },
    undefined,
    { timeout: 5_000 },
  );

  const src = await page.locator(".react-flow__handle.source").first().boundingBox();
  const tgt = await page.locator(".react-flow__handle.target").last().boundingBox();
  if (!src || !tgt) throw new Error("source/target handles not found");
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.locator(".react-flow__edge").first().waitFor({ state: "visible", timeout: 5_000 });

  // Delete the first node via React Flow's default Backspace-on-selection.
  await page.locator(".react-flow__node").first().click();
  await page.keyboard.press("Backspace");
  await page.waitForFunction(() => document.querySelectorAll(".react-flow__node").length === 1);

  // Save again and assert the PUT draft carries the remaining node type.
  const putDraft = page.waitForResponse(
    (r) => r.request().method() === "PUT" && r.url().endsWith("/flows/f1/draft"),
  );
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const putBody = (await putDraft).request().postData() ?? "";
  if (!putBody.includes("hangup")) throw new Error("draft PUT does not carry the remaining node");

  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, "flow-designer-verified.png"), fullPage: true });
  writeFileSync(path.join(artifacts, "api-calls.json"), JSON.stringify(calls, null, 2));

  if (pageErrors.length) throw new Error(`Uncaught page errors: ${JSON.stringify(pageErrors)}`);
  console.log(`E2E PASS — ${calls.length} API calls; toolbar + save/validate/publish verified in Chromium`);
  console.log(`Artifacts: ${artifacts}`);
} finally {
  await browser.close();
  await server.close();
}
