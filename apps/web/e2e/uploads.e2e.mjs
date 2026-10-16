/**
 * PromptsPage / MohPage file-upload e2e (Playwright + Vite dev server).
 * Run: pnpm --filter @dsip/web test:e2e   (chained after flow-designer.e2e.mjs)
 *
 * Uses Playwright's file-chooser API against the real upload inputs:
 *  - PromptsPage create-with-upload (visible input[type=file] in the form)
 *  - PromptsPage per-row replace-audio (button arms a hidden picker)
 *  - MohPage per-class Upload (button arms a hidden picker)
 * All /api/v1 traffic is intercepted; a minimal valid WAV is generated inline.
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = path.join(webRoot, "e2e", "artifacts");
mkdirSync(artifacts, { recursive: true });

// Minimal valid mono 8 kHz 16-bit PCM WAV (44-byte header + 800 samples).
const data = Buffer.alloc(1600);
for (let i = 0; i < data.length; i += 2) data.writeInt16LE(Math.round(8000 * Math.sin((i / 2) * 0.2)), i);
const hdr = Buffer.alloc(44);
hdr.write("RIFF", 0);
hdr.writeUInt32LE(36 + data.length, 4);
hdr.write("WAVE", 8);
hdr.write("fmt ", 12);
hdr.writeUInt32LE(16, 16);
hdr.writeUInt16LE(1, 20);
hdr.writeUInt16LE(1, 22);
hdr.writeUInt32LE(8000, 24);
hdr.writeUInt32LE(16000, 28);
hdr.writeUInt16LE(2, 32);
hdr.writeUInt16LE(16, 34);
hdr.write("data", 36);
hdr.writeUInt32LE(data.length, 40);
const wavPath = path.join(artifacts, "tone.wav");
writeFileSync(wavPath, Buffer.concat([hdr, data]));

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

async function uploadViaFileChooser(trigger) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), trigger.click()]);
  await chooser.setFiles(wavPath);
}

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
    if (method === "GET" && p === "/api/v1/admin/prompts")
      return fulfill([{ id: "p1", name: "existing", language: "en", ttsText: "Hi", filePath: null }]);
    if (method === "GET" && p === "/api/v1/admin/moh")
      return fulfill([{ id: "mc1", name: "Hold Music", files: ["tone.wav"] }]);
    if (method === "POST" && p === "/api/v1/admin/prompts/upload")
      return fulfill({ id: "p9", name: "tone", language: "en", ttsText: null, filePath: "/x/tone.wav" });
    if (method === "POST" && (p === "/api/v1/admin/prompts/p1/upload" || p === "/api/v1/admin/moh/mc1/upload"))
      return fulfill({});
    if (p.includes("/admin/queues") || p.includes("/admin/extensions") ||
        p.includes("/admin/schedules") || p.includes("/admin/flows") || p.includes("/admin/secrets"))
      return fulfill([]);
    return fulfill({ ok: true });
  });

  // --- PromptsPage: create-with-upload via the form's visible file input ---
  await page.goto(`${base}/prompts`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" }); // warm page: cold Vite may reload mid-load
  const formInput = page.locator("form input[type=file]");
  await formInput.waitFor({ state: "attached", timeout: 15_000 });
  await uploadViaFileChooser(formInput);
  await page.locator("form button[type=submit]").click();
  await page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/api/v1/admin/prompts/upload"),
  );

  // --- PromptsPage: per-row replace-audio ---
  const replace = page.getByRole("button", { name: /upload/i }).first();
  await replace.waitFor({ state: "visible", timeout: 10_000 });
  await uploadViaFileChooser(replace);
  await page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/api/v1/admin/prompts/p1/upload"),
  );

  // --- MohPage: per-class upload ---
  await page.goto(`${base}/moh`, { waitUntil: "networkidle" });
  const mohUpload = page.getByRole("button", { name: /upload/i }).first();
  await mohUpload.waitFor({ state: "visible", timeout: 15_000 });
  await uploadViaFileChooser(mohUpload);
  await page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/api/v1/admin/moh/mc1/upload"),
  );
  await page.getByText("Uploaded tone.wav").waitFor({ state: "visible", timeout: 5_000 });

  await page.screenshot({ path: path.join(artifacts, "uploads-verified.png"), fullPage: true });
  writeFileSync(path.join(artifacts, "uploads-api-calls.json"), JSON.stringify(calls, null, 2));

  if (pageErrors.length) throw new Error(`Uncaught page errors: ${JSON.stringify(pageErrors)}`);
  console.log(`UPLOADS E2E PASS — ${calls.length} API calls; prompts create/replace + moh upload verified`);
} finally {
  await browser.close();
  await server.close();
}
