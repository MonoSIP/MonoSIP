/**
 * Queue end-to-end test against a running DSip, with real browser softphones.
 *
 * Creates (or updates) test extensions 291/292 (agents) and 293 (caller) and a
 * ringall queue 790 with both agents, short timeouts and hangup overflow, then:
 *   Q1 an agent answers → connected, CDR has queue + agent + wait time
 *   Q2 one agent busy on another call → only the free agent rings
 *   Q3 no agent registered → join-empty overflow hangs up at once
 *   Q4 agents never answer → timeout overflow after maxWait
 *
 * Run: BASE_URL=http://localhost:3000 node apps/web/e2e/queue.e2e.mjs
 * Env: ADMIN_EMAIL / ADMIN_PASSWORD. Report → apps/web/e2e/artifacts/queue-report.json
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const QUEUE = "790";
const AGENTS = ["291", "292"];
const CALLER = "293";
const PASS = (ext) => `testpass${ext}`;
const MAX_WAIT = 25;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const artifacts = path.join(path.dirname(fileURLToPath(import.meta.url)), "artifacts");
mkdirSync(artifacts, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const admin = await browser.newContext();
{
  const r = await admin.request.post(`${BASE}/api/v1/admin/auth/login`, {
    data: { email: process.env.ADMIN_EMAIL ?? "admin@example.com", password: process.env.ADMIN_PASSWORD ?? "Admin123!" },
  });
  if (!r.ok()) throw new Error(`admin login ${r.status()}`);
}
const api = async (method, p, data) => {
  const r = await admin.request.fetch(`${BASE}${p}`, { method, data });
  const body = await r.text();
  if (!r.ok()) throw new Error(`${method} ${p} → ${r.status()} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
};

// ── Setup: test extensions + queue (idempotent) ───────────────────────────────
const exts = await api("GET", "/api/v1/admin/extensions");
const extId = {};
for (const [num, name] of [["291", "Test Agent 1"], ["292", "Test Agent 2"], ["293", "Test Caller"]]) {
  const found = exts.find((e) => e.number === num);
  if (found) {
    await api("PATCH", `/api/v1/admin/extensions/${found.id}`, { name, dnd: false, portalEnabled: true, portalPassword: PASS(num) });
    extId[num] = found.id;
  } else {
    extId[num] = (await api("POST", "/api/v1/admin/extensions", { number: num, name, portalPassword: PASS(num) })).id;
  }
}
const queueBody = {
  name: "Test Kuyruk",
  number: QUEUE,
  strategy: "ringall",
  memberTimeout: 8,
  wrapup: 0,
  maxWait: MAX_WAIT,
  maxCallers: 10,
  announceHoldtime: false,
  announcePosition: false,
  timeoutDestType: "hangup",
  fullDestType: "hangup",
  joinemptyDestType: "hangup",
  callbackEnabled: false,
  members: AGENTS.map((a) => ({ extensionId: extId[a], penalty: 0, paused: false })),
};
const queues = await api("GET", "/api/v1/admin/queues");
const q = queues.find((x) => x.number === QUEUE);
if (q) await api("PATCH", `/api/v1/admin/queues/${q.id}`, queueBody);
else await api("POST", "/api/v1/admin/queues", queueBody);
await sleep(4000); // Asterisk reload

// ── Phones ────────────────────────────────────────────────────────────────────
const SIP_TAP = `(() => { const W = window.WebSocket; window.__sip = [];
  const log = (m) => window.__sip.push({ t: Date.now(), m });
  window.WebSocket = function (u, p) { const ws = p ? new W(u, p) : new W(u); if (!String(u).includes('asterisk-ws')) return ws;
    const send = ws.send.bind(ws); ws.send = (d) => { const l = String(d).split('\\r\\n')[0]; if (l) log('>> ' + l); return send(d); };
    ws.addEventListener('message', (e) => { const l = String(e.data).split('\\r\\n')[0]; if (l) log('<< ' + l); }); return ws; };
  window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); })();`;
const phones = [];
async function phone(ext) {
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  const r = await ctx.request.post(`${BASE}/api/v1/auth/login`, { data: { extension: ext, password: PASS(ext) } });
  if (!r.ok()) throw new Error(`login ${ext} ${r.status()}`);
  const page = await ctx.newPage();
  await page.addInitScript(SIP_TAP);
  await page.goto(`${BASE}/portal/phone`);
  await page.getByText(/^(Registered|Kayıtlı)$/).first().waitFor({ timeout: 20000 });
  const p = { ext, ctx, page };
  phones.push(p);
  return p;
}
const sip = (p) => p.page.evaluate(() => window.__sip);
async function waitSip(p, re, ms, from = 0) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const hit = (await sip(p)).slice(from).find((l) => re.test(l.m));
    if (hit) return { ...hit, after: Date.now() - t0 };
    await sleep(250);
  }
  return null;
}
const dial = async (p, n) => {
  for (const d of n) await p.page.getByRole("button", { name: d, exact: true }).first().click();
  await p.page.getByRole("button", { name: /^(Dial|Ara)$/ }).click();
};
const answer = (p) => p.page.getByRole("button", { name: /^(Answer|Cevapla)$/ }).click();
const hangup = async (p) => {
  const b = p.page.getByRole("button", { name: /^(Hang up|Kapat)$/ });
  if ((await b.count()) && (await b.isEnabled().catch(() => false))) await b.click().catch(() => {});
};
async function closeAll() {
  for (const p of phones.splice(0)) {
    await hangup(p);
    await sleep(300);
    await p.ctx.close();
  }
  await sleep(2500); // contacts removed on transport shutdown
}

const results = [];
async function scenario(id, title, fn) {
  process.stdout.write(`${id} ${title} … `);
  let r;
  try {
    r = await fn();
  } catch (e) {
    r = { ok: false, evidence: { error: String(e?.message ?? e) } };
  }
  await closeAll();
  results.push({ id, title, ...r });
  console.log(r.ok ? "PASS" : "FAIL", JSON.stringify(r.evidence));
}

await scenario("Q1", "An agent answers the queue call", async () => {
  const a1 = await phone("291");
  const a2 = await phone("292");
  const c = await phone(CALLER);
  const since = new Date(Date.now() - 2000);
  await dial(c, QUEUE);
  const r1 = await waitSip(a1, /^<< INVITE /, 20000);
  const r2 = await waitSip(a2, /^<< INVITE /, 1000);
  if (r1) await answer(a1);
  const up = r1 ? await waitSip(a1, /^>> SIP\/2\.0 200 OK/, 8000) : null;
  await sleep(4000); // talk a moment
  await hangup(c);
  await sleep(4000);
  const rows = await api("GET", `/api/v1/admin/cdr?caller=${CALLER}&limit=5`);
  const row = rows.find((x) => new Date(x.startedAt) >= since && x.queueNumber === QUEUE);
  return {
    ok: !!r1 && !!r2 && !!up && !!row && row.disposition === "ANSWERED" && row.extensionNumber === "291",
    evidence: { bothRang: !!r1 && !!r2, agentAnswered: !!up, cdr: row && { disposition: row.disposition, agent: row.extensionNumber, waitSec: row.waitSec, billsec: row.billsec } },
  };
});

await scenario("Q2", "Busy agent is skipped, free agent rings", async () => {
  const a1 = await phone("291");
  const a2 = await phone("292");
  await dial(a1, "900"); // 291 busy in the IVR
  await waitSip(a1, /^<< SIP\/2\.0 200 OK/, 15000);
  const from1 = (await sip(a1)).length;
  const c = await phone(CALLER);
  await dial(c, QUEUE);
  const r2 = await waitSip(a2, /^<< INVITE /, 20000);
  const r1 = (await sip(a1)).slice(from1).some((l) => /^<< INVITE /.test(l.m));
  if (r2) await answer(a2);
  const up = r2 ? await waitSip(a2, /^>> SIP\/2\.0 200 OK/, 8000) : null;
  return { ok: !!r2 && !!up && !r1, evidence: { freeAgentRang: !!r2, busyAgentRang: r1, connected: !!up } };
});

await scenario("Q3", "No agent registered → join-empty overflow hangs up", async () => {
  const c = await phone(CALLER);
  const from = (await sip(c)).length;
  await dial(c, QUEUE);
  const bye = await waitSip(c, /^<< BYE /, 20000, from);
  return { ok: !!bye && bye.after < 15000, evidence: { hungUpAfterMs: bye?.after ?? null } };
});

await scenario("Q4", `Nobody answers → timeout overflow after maxWait ${MAX_WAIT}s`, async () => {
  await phone("291");
  await phone("292");
  const c = await phone(CALLER);
  const from = (await sip(c)).length;
  await dial(c, QUEUE);
  const bye = await waitSip(c, /^<< BYE /, (MAX_WAIT + 25) * 1000, from);
  const s = bye ? Math.round(bye.after / 1000) : null;
  return { ok: !!bye && s >= MAX_WAIT - 3 && s <= MAX_WAIT + 15, evidence: { hungUpAfterS: s } };
});

await browser.close();
writeFileSync(path.join(artifacts, "queue-report.json"), JSON.stringify({ base: BASE, results }, null, 2));
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
