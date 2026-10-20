/**
 * Live SIP + IVR end-to-end suite against a running DSip (all-in-one image).
 *
 * Every phone is a real headless Chromium (fake mic, real WebRTC) running the
 * actual portal softphone, each in its own browser context (own login/cookies).
 * SIP traffic is captured per phone by wrapping WebSocket; server-side outcomes
 * are read from the admin CDR timeline (flow.node / flow.exit events).
 *
 * Run:  BASE_URL=http://localhost:3000 node apps/web/e2e/sip-ivr.e2e.mjs
 * Env:  ADMIN_EMAIL / ADMIN_PASSWORD (default seed admin), EXT_PASS_<n> (default portal<n>),
 *       ONLY=C1,I4 to run a subset. Report → apps/web/e2e/artifacts/sip-ivr-report.{json,md}
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin123!";
const IVR = process.env.IVR_NUMBER ?? "900";
const ONLY = (process.env.ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const artifacts = path.join(path.dirname(fileURLToPath(import.meta.url)), "artifacts");
mkdirSync(artifacts, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pass = (ext) => process.env[`EXT_PASS_${ext}`] ?? `portal${ext}`;

/** Records SIP first lines (and BYE/INVITE etc.) on the page as window.__sip. */
const SIP_TAP = `(() => {
  const W = window.WebSocket; window.__sip = []; const t0 = performance.now();
  const log = (m) => window.__sip.push({ t: Math.round(performance.now() - t0), m });
  window.WebSocket = function (url, proto) {
    const ws = proto ? new W(url, proto) : new W(url);
    if (!String(url).includes('asterisk-ws')) return ws;
    log('WS NEW');
    ws.addEventListener('open', () => log('WS OPEN'));
    ws.addEventListener('close', (e) => log('WS CLOSE ' + e.code));
    const send = ws.send.bind(ws);
    ws.send = (d) => { const l = String(d).split('\\r\\n')[0]; if (l) log('>> ' + l); return send(d); };
    ws.addEventListener('message', (e) => { const l = String(e.data).split('\\r\\n')[0]; if (l) log('<< ' + l); });
    return ws;
  };
  window.WebSocket.prototype = W.prototype;
  Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
})();`;

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

/* ------------------------------------------------------------------ */
/* Admin API (timeline evidence)                                       */
/* ------------------------------------------------------------------ */
const adminCtx = await browser.newContext();
{
  const r = await adminCtx.request.post(`${BASE}/api/v1/admin/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (!r.ok()) throw new Error(`admin login failed: ${r.status()} ${await r.text()}`);
}
const adminGet = async (p) => {
  const r = await adminCtx.request.get(`${BASE}${p}`);
  return r.ok() ? r.json() : null;
};

/** Newest CDR for `caller` started after `since`, with its flow timeline. */
async function lastCallTimeline(caller, since) {
  const rows = (await adminGet(`/api/v1/admin/cdr?caller=${caller}&limit=10`)) ?? [];
  const row = rows.find((r) => new Date(r.startedAt) >= since && r.callee === IVR) ?? rows.find((r) => new Date(r.startedAt) >= since);
  if (!row) return null;
  const tl = await adminGet(`/api/v1/admin/cdr/${row.id}/timeline`);
  const events = (tl?.events ?? []).map((e) => ({
    at: e.at,
    type: e.type,
    node: e.data?.nodeId ?? null,
    nodeType: e.data?.nodeType ?? null,
    digit: e.data?.digit ?? null,
  }));
  return { cdr: row, events };
}

/* ------------------------------------------------------------------ */
/* Phone driver                                                        */
/* ------------------------------------------------------------------ */
const phones = [];

async function openPhone(ext, { tap = true } = {}) {
  const ctx = await browser.newContext({ permissions: ["microphone", "notifications"] });
  const r = await ctx.request.post(`${BASE}/api/v1/auth/login`, { data: { extension: ext, password: pass(ext) } });
  if (!r.ok()) throw new Error(`portal login ${ext} failed: ${r.status()}`);
  const page = await ctx.newPage();
  if (tap) await page.addInitScript(SIP_TAP);
  await page.goto(`${BASE}/portal/phone`);
  const phone = { ext, ctx, page };
  phones.push(phone);
  return phone;
}

async function closePhone(phone) {
  // Hang up first: a tab closed mid-call leaves the channel up until rtp_timeout
  // (60s), which would make the extension look busy to the next scenario.
  await hangup(phone).catch(() => undefined);
  await sleep(300);
  await phone.ctx.close().catch(() => undefined);
  const i = phones.indexOf(phone);
  if (i >= 0) phones.splice(i, 1);
}

const sipLog = (phone) => phone.page.evaluate(() => window.__sip ?? []);

/** Wait for "Registered" in the page header; returns ms or null on timeout. */
async function waitRegistered(phone, timeoutMs = 15_000) {
  const t0 = Date.now();
  try {
    await phone.page.getByText("Registered", { exact: true }).first().waitFor({ timeout: timeoutMs });
    return Date.now() - t0;
  } catch {
    return null;
  }
}

/** Wait until the SIP tap shows a line matching `re` (after index `from`). */
async function waitSip(phone, re, timeoutMs, from = 0) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const log = await sipLog(phone);
    const hit = log.slice(from).find((l) => re.test(l.m));
    if (hit) return { ...hit, waitedMs: Date.now() - t0 };
    await sleep(250);
  }
  return null;
}

async function dial(phone, number) {
  const input = phone.page.locator("input.input").first();
  await input.fill(number);
  await phone.page.getByRole("button", { name: "Dial", exact: true }).click();
}

async function pressKey(phone, digit) {
  await phone.page.getByRole("button", { name: digit, exact: true }).first().click();
}

async function answer(phone) {
  await phone.page.getByRole("button", { name: "Answer", exact: true }).click();
}

async function hangup(phone) {
  const b = phone.page.getByRole("button", { name: "Hang up" });
  if ((await b.count()) === 0) return; // no call UI — don't wait out the locator timeout
  if (await b.isEnabled({ timeout: 1000 }).catch(() => false)) await b.click({ timeout: 2000 }).catch(() => undefined);
}

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */
const results = [];
const suiteStart = new Date();

async function scenario(id, title, expect, fn) {
  if (ONLY.length && !ONLY.includes(id)) return;
  const started = Date.now();
  process.stdout.write(`${id} ${title} … `);
  let ok = false;
  let evidence = {};
  try {
    const r = await fn();
    ok = r.ok;
    evidence = r.evidence ?? {};
  } catch (e) {
    evidence = { error: String(e?.stack ?? e) };
  }
  for (const p of [...phones]) await closePhone(p);
  await sleep(1500); // let Asterisk tear down contacts/channels between scenarios
  const ms = Date.now() - started;
  results.push({ id, title, expect, ok, ms, evidence });
  console.log(`${ok ? "PASS" : "FAIL"} (${(ms / 1000).toFixed(1)}s)`);
}

/** Dial the IVR from `phone`, wait until the menu node runs, return the call start time. */
async function reachMenu(phone) {
  const since = new Date(Date.now() - 2000);
  await dial(phone, IVR);
  const answered = await waitSip(phone, /^<< SIP\/2\.0 200 OK/, 15_000);
  // Wait for the flow to reach the menu node before sending DTMF
  for (let i = 0; i < 60; i++) {
    const tl = await lastCallTimeline(phone.ext, since);
    if (tl?.events.some((e) => e.nodeType === "menu")) return { since, answered, tl };
    await sleep(500);
  }
  return { since, answered, tl: await lastCallTimeline(phone.ext, since) };
}

/** After a menu choice, wait for the server to end the call (BYE to caller). */
async function waitServerHangup(phone, from, timeoutMs) {
  return waitSip(phone, /^<< BYE /, timeoutMs, from);
}

// ---------- Client ↔ server ----------

await scenario("C1", "Fresh softphone registers", "REGISTER → 401 → 200 OK, UI shows Registered", async () => {
  const p = await openPhone("101");
  const ms = await waitRegistered(p);
  return { ok: ms !== null, evidence: { registeredMs: ms, sip: await sipLog(p) } };
});

await scenario("C2", "Reload the page 6× in a row", "Every reload registers again (no stuck 'Connecting' after max_contacts=3)", async () => {
  const p = await openPhone("101");
  const runs = [];
  for (let i = 0; i < 6; i++) {
    if (i > 0) await p.page.reload();
    runs.push(await waitRegistered(p));
  }
  return { ok: runs.every((r) => r !== null), evidence: { registeredMsPerReload: runs, lastSip: await sipLog(p) } };
});

await scenario("C3", "Four tabs on the same extension", "All tabs register (contacts beyond max_contacts must not hang the stack)", async () => {
  const tabs = [];
  for (let i = 0; i < 4; i++) tabs.push(await openPhone("101"));
  const regs = [];
  for (const t of tabs) regs.push(await waitRegistered(t));
  const sips = await Promise.all(tabs.map(sipLog));
  const lastResponses = sips.map((s) => s.filter((l) => l.m.startsWith("<< SIP/2.0")).map((l) => l.m).slice(-2));
  // A 403 (max contacts) is acceptable for the 4th tab; silence is not.
  const answered = sips.every((s) => s.some((l) => l.m.startsWith("<< SIP/2.0")));
  return { ok: answered && regs.slice(0, 3).every((r) => r !== null), evidence: { regs, lastResponses } };
});

await scenario("C4", "Register while Asterisk reloads config (DND toggles)", "Connected phone stays usable and a new phone still registers during/after reloads", async () => {
  const a = await openPhone("101");
  const regA = await waitRegistered(a);
  // Reload storm: 8 config writes at once (each used to run its own Asterisk reload,
  // plus the reload.flag watcher — overlapping `module reload res_pjsip.so` deadlocked).
  await Promise.all(
    [true, false, true, false, true, false, true, false].map((dnd) =>
      a.ctx.request.put(`${BASE}/api/v1/me/dnd`, { data: { dnd } }),
    ),
  );
  await sleep(6000);
  const diag = await adminGet("/api/v1/admin/system/sip-diag");
  const b = await openPhone("102");
  const regB = await waitRegistered(b, 20_000);
  // Existing phone: an OPTIONS-style liveness check = place a call to the IVR and get 200 OK
  const from = (await sipLog(a)).length;
  await dial(a, IVR);
  const ok200 = await waitSip(a, /^<< SIP\/2\.0 200 OK/, 15_000, from);
  await hangup(a);
  const probe = diag?.probe ?? null;
  return {
    ok: regA !== null && regB !== null && !!ok200 && (!diag || /^SIP\/2\.0 \d{3}/.test(probe?.firstLine ?? "")) /* any reply (401 included) = stack alive */,
    evidence: { regA, regB, inviteAnsweredAfterReloads: !!ok200, sipProbeAfterStorm: probe, proxy: diag?.proxy },
  };
});

await scenario("C5", "Three calls in a row from one phone", "Every call is answered (not only the first)", async () => {
  const p = await openPhone("101");
  await waitRegistered(p);
  const calls = [];
  for (let i = 0; i < 3; i++) {
    const from = (await sipLog(p)).length;
    await dial(p, IVR);
    const ok = await waitSip(p, /^<< SIP\/2\.0 200 OK/, 15_000, from);
    await sleep(3000);
    await hangup(p);
    await sleep(3000);
    calls.push(ok ? ok.waitedMs : null);
  }
  const reg = await p.page.getByText("Registered", { exact: true }).count();
  return { ok: calls.every((c) => c !== null) && reg > 0, evidence: { answerMs: calls, stillRegistered: reg > 0 } };
});

await scenario("C6", "Network drop for 8s then back", "Softphone reconnects and registers again", async () => {
  const p = await openPhone("101");
  await waitRegistered(p);
  await p.ctx.setOffline(true);
  await sleep(8000);
  await p.ctx.setOffline(false);
  const t0 = Date.now();
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    const log = await sipLog(p);
    const lastOpen = log.map((l) => l.m).lastIndexOf("WS OPEN");
    ok = lastOpen > 0 && log.slice(lastOpen).some((l) => l.m === "<< SIP/2.0 200 OK");
    if (!ok) await sleep(500);
  }
  return { ok, evidence: { recoveredMs: ok ? Date.now() - t0 : null, sip: (await sipLog(p)).slice(-12) } };
});

// ---------- IVR ----------

await scenario("I1", "IVR menu timeout", "No key pressed → menu timeout exit → Hangup node → caller gets BYE", async () => {
  const p = await openPhone("101");
  await waitRegistered(p);
  const { since } = await reachMenu(p);
  const from = (await sipLog(p)).length;
  const bye = await waitServerHangup(p, from, 45_000);
  const tl = await lastCallTimeline("101", since);
  return { ok: !!bye && !!tl?.events.some((e) => e.nodeType === "hangup"), evidence: { byeAfterMs: bye?.waitedMs, timeline: tl?.events } };
});

await scenario("I2", "Menu 1 → operator answers", "Press 1 → transfer to 102 → 102 rings → answer → connected", async () => {
  const op = await openPhone("102");
  await waitRegistered(op);
  const p = await openPhone("101");
  await waitRegistered(p);
  const { since } = await reachMenu(p);
  await pressKey(p, "1");
  const ring = await waitSip(op, /^<< INVITE /, 20_000);
  if (ring) await answer(op);
  const opUp = ring ? await waitSip(op, /^>> SIP\/2\.0 200 OK/, 10_000) : null;
  await sleep(3000);
  const tl = await lastCallTimeline("101", since);
  const callerSip = (await sipLog(p)).slice(-15);
  await hangup(p);
  return { ok: !!ring && !!opUp, evidence: { operatorRang: !!ring, operatorAnswered: !!opUp, timeline: tl?.events, callerSip } };
});

await scenario("I3", "Menu 2 → operator not registered", "Press 2 → 103 offline → 'not registered' prompt → Hangup within ~10s", async () => {
  const p = await openPhone("101");
  await waitRegistered(p);
  const { since } = await reachMenu(p);
  const from = (await sipLog(p)).length;
  await pressKey(p, "2");
  const bye = await waitServerHangup(p, from, 25_000);
  const tl = await lastCallTimeline("101", since);
  return {
    ok: !!bye && bye.waitedMs < 15_000 && !!tl?.events.some((e) => e.nodeType === "hangup"),
    evidence: { byeAfterMs: bye?.waitedMs, timeline: tl?.events },
  };
});

await scenario("I4", "Menu 2 → operator BUSY on another call", "103 is in a call → caller hears 'busy' → Hangup; 103 must NOT ring", async () => {
  const op = await openPhone("103");
  const other = await openPhone("102");
  await waitRegistered(op);
  await waitRegistered(other);
  // Make 103 busy: 103 calls 102, 102 answers
  await dial(op, "102");
  const r = await waitSip(other, /^<< INVITE /, 15_000);
  if (r) await answer(other);
  const busyUp = await waitSip(op, /^<< SIP\/2\.0 200 OK/, 15_000);
  const opFrom = (await sipLog(op)).length;

  const p = await openPhone("101");
  await waitRegistered(p);
  const { since } = await reachMenu(p);
  const from = (await sipLog(p)).length;
  await pressKey(p, "2");
  const bye = await waitServerHangup(p, from, 25_000);
  const opRang = (await sipLog(op)).slice(opFrom).some((l) => l.m.startsWith("<< INVITE"));
  const tl = await lastCallTimeline("101", since);
  await hangup(op);
  return {
    ok: !!busyUp && !!bye && bye.waitedMs < 15_000 && !opRang,
    evidence: { operatorBusy: !!busyUp, byeAfterMs: bye?.waitedMs, operatorRangWhileBusy: opRang, timeline: tl?.events },
  };
});

await scenario("I5", "Menu 2 → operator rejects the call", "103 presses hang up while ringing → 486 → busy exit → Hangup", async () => {
  const op = await openPhone("103");
  await waitRegistered(op);
  const p = await openPhone("101");
  await waitRegistered(p);
  const { since } = await reachMenu(p);
  const from = (await sipLog(p)).length;
  await pressKey(p, "2");
  const ring = await waitSip(op, /^<< INVITE /, 20_000);
  if (ring) {
    await sleep(1500);
    await hangup(op);
  }
  const sent486 = await waitSip(op, /^>> SIP\/2\.0 486/, 5000);
  const bye = await waitServerHangup(p, from, 20_000);
  const tl = await lastCallTimeline("101", since);
  return { ok: !!ring && !!sent486 && !!bye, evidence: { operatorRang: !!ring, sent486: !!sent486, byeAfterMs: bye?.waitedMs, timeline: tl?.events } };
});

await scenario("I6", "Menu 2 → operator does not answer", "103 rings until the 30s timeout → noanswer exit → Hangup", async () => {
  const op = await openPhone("103");
  await waitRegistered(op);
  const p = await openPhone("101");
  await waitRegistered(p);
  const { since } = await reachMenu(p);
  const from = (await sipLog(p)).length;
  await pressKey(p, "2");
  const ring = await waitSip(op, /^<< INVITE /, 20_000);
  const bye = await waitServerHangup(p, from, 50_000);
  const tl = await lastCallTimeline("101", since);
  return { ok: !!ring && !!bye, evidence: { operatorRang: !!ring, byeAfterMs: bye?.waitedMs, timeline: tl?.events } };
});

await scenario("I7", "Busy softphone gets a second call directly", "103 in a call, 101 dials 103 → 486 Busy (call is not replaced)", async () => {
  const op = await openPhone("103");
  const other = await openPhone("102");
  await waitRegistered(op);
  await waitRegistered(other);
  await dial(op, "102");
  const r = await waitSip(other, /^<< INVITE /, 15_000);
  if (r) await answer(other);
  await waitSip(op, /^<< SIP\/2\.0 200 OK/, 15_000);
  const opFrom = (await sipLog(op)).length;
  const p = await openPhone("101");
  await waitRegistered(p);
  const from = (await sipLog(p)).length;
  await dial(p, "103");
  const res = await waitSip(p, /^<< (SIP\/2\.0 (486|4\d\d|5\d\d|6\d\d)|BYE)/, 40_000, from);
  const opGot = (await sipLog(op)).slice(opFrom).filter((l) => /INVITE|486/.test(l.m)).map((l) => l.m);
  const stillInCall = await op.page.getByRole("button", { name: "Hang up" }).isEnabled().catch(() => false);
  await hangup(op);
  return { ok: !!res && stillInCall, evidence: { callerResult: res?.m, operatorSip: opGot, operatorCallKept: stillInCall } };
});

await scenario("X1", "Call records are closed", "Every IVR call of this run has an end time in the CDR", async () => {
  await sleep(3000);
  const rows = ((await adminGet(`/api/v1/admin/cdr?limit=200`)) ?? []).filter(
    (r) => new Date(r.startedAt) >= suiteStart && r.callee === IVR,
  );
  const open = rows.filter((r) => !r.endedAt).map((r) => ({ callId: r.callId, startedAt: r.startedAt }));
  return { ok: rows.length > 0 && open.length === 0, evidence: { ivrCalls: rows.length, stillOpen: open } };
});

await browser.close();

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */
const passed = results.filter((r) => r.ok).length;
const md = [
  `# DSip SIP + IVR e2e — ${new Date().toISOString()}`,
  ``,
  `Target: ${BASE} · ${passed}/${results.length} passed`,
  ``,
  `| ID | Scenario | Expected | Result | Time |`,
  `|---|---|---|---|---|`,
  ...results.map((r) => `| ${r.id} | ${r.title} | ${r.expect} | ${r.ok ? "✅ PASS" : "❌ FAIL"} | ${(r.ms / 1000).toFixed(1)}s |`),
  ``,
  ...results.map((r) => `## ${r.id} — ${r.title}\n\n\`\`\`json\n${JSON.stringify(r.evidence, null, 2).slice(0, 4000)}\n\`\`\`\n`),
].join("\n");
writeFileSync(path.join(artifacts, "sip-ivr-report.json"), JSON.stringify({ base: BASE, results }, null, 2));
writeFileSync(path.join(artifacts, "sip-ivr-report.md"), md);
console.log(`\n${passed}/${results.length} passed — report: ${path.join(artifacts, "sip-ivr-report.md")}`);
process.exit(passed === results.length ? 0 : 1);
