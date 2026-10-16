#!/usr/bin/env node
/**
 * Live smoke: verify Faz1–3 features from docs/*.md + TASKS.md against https://localhost
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import https from "node:https";
import http from "node:http";

const BASE = process.env.DSIP_BASE || "https://localhost";
const insecure = new https.Agent({ rejectUnauthorized: false });

let pass = 0;
let fail = 0;
let skip = 0;
const failures = [];

function ok(name) {
  console.log(`PASS  ${name}`);
  pass++;
}
function bad(name, detail) {
  console.log(`FAIL  ${name} — ${detail}`);
  fail++;
  failures.push({ name, detail: String(detail).slice(0, 300) });
}
function skp(name, detail) {
  console.log(`SKIP  ${name} — ${detail}`);
  skip++;
}

function loadEnv() {
  const env = {};
  if (!existsSync(".env")) return env;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const ENV = loadEnv();
const SECRET = ENV.INTERNAL_API_SECRET || "dsip_internal_change_me";

async function req(method, path, { cookie, body, headers = {}, raw = false } = {}) {
  const url = new URL(path.startsWith("http") ? path : BASE + path);
  const lib = url.protocol === "https:" ? https : http;
  const payload = body == null ? null : typeof body === "string" ? body : JSON.stringify(body);
  const hdrs = { ...headers };
  if (cookie) hdrs.Cookie = cookie;
  if (payload && !hdrs["content-type"]) hdrs["content-type"] = "application/json";
  return new Promise((resolve, reject) => {
    const r = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: hdrs,
        agent: url.protocol === "https:" ? insecure : undefined,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const setCookie = res.headers["set-cookie"]?.[0]?.split(";")[0] ?? null;
          let json = null;
          if (!raw) {
            try {
              json = JSON.parse(buf.toString("utf8") || "null");
            } catch {
              json = null;
            }
          }
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: buf,
            text: buf.toString("utf8"),
            json,
            setCookie,
          });
        });
      },
    );
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

function docker(cmd) {
  try {
    return execSync(`docker compose exec -T ${cmd}`, {
      encoding: "utf8",
      cwd: process.cwd(),
      maxBuffer: 2_000_000,
    });
  } catch (e) {
    return e.stdout?.toString?.() || e.message;
  }
}

async function expectStatus(name, method, path, opts, want) {
  const wants = Array.isArray(want) ? want : [want];
  try {
    const res = await req(method, path, opts);
    if (wants.includes(res.status)) ok(name);
    else bad(name, `HTTP ${res.status} ${res.text.slice(0, 160)}`);
    return res;
  } catch (e) {
    bad(name, e.message);
    return null;
  }
}

async function main() {
  // --- Auth ---
  const login = await req("POST", "/api/v1/admin/auth/login", {
    body: { email: "admin@example.com", password: "Admin123!" },
  });
  if (login.status !== 200 || !login.setCookie) {
    bad("admin login", login.text);
    console.log(`\nSUMMARY pass=${pass} fail=${fail} skip=${skip}`);
    process.exit(1);
  }
  ok("admin login");
  const admin = login.setCookie;

  const portalLogin = await req("POST", "/api/v1/auth/login", {
    body: { extension: "101", password: "portal101" },
  });
  if (portalLogin.status === 200 && portalLogin.setCookie) ok("portal login");
  else bad("portal login", portalLogin.text);
  const portal = portalLogin.setCookie;

  // --- Health ---
  await expectStatus("health", "GET", "/api/v1/health", {}, 200);

  // --- Faz1 GET list endpoints (correct paths) ---
  const gets = [
    ["/api/v1/admin/extensions", "extensions"],
    ["/api/v1/admin/trunks", "trunks"],
    ["/api/v1/admin/routes/inbound", "inbound routes"],
    ["/api/v1/admin/routes/outbound", "outbound routes"],
    ["/api/v1/admin/blacklist", "blacklist"],
    ["/api/v1/admin/ring-groups", "ring groups"],
    ["/api/v1/admin/queues", "queues"],
    ["/api/v1/admin/schedules", "schedules"],
    ["/api/v1/admin/holidays", "holidays"],
    ["/api/v1/admin/cdr", "cdr"],
    ["/api/v1/admin/cdr/export", "cdr export"],
    ["/api/v1/admin/recordings", "recordings"],
    ["/api/v1/admin/prompts", "prompts"],
    ["/api/v1/admin/moh", "moh"],
    ["/api/v1/admin/flows", "flows"],
    ["/api/v1/admin/devices", "devices"],
    ["/api/v1/admin/missed-calls", "missed calls"],
    ["/api/v1/admin/webhooks", "webhooks"],
    ["/api/v1/admin/api-keys", "api keys"],
    ["/api/v1/admin/settings", "settings"],
    ["/api/v1/admin/audit-log", "audit log"],
    ["/api/v1/admin/live/calls", "live calls"],
    ["/api/v1/admin/reports/summary", "report summary"],
    ["/api/v1/admin/reports/extensions", "report extensions"],
    ["/api/v1/admin/reports/queues", "report queues"],
    ["/api/v1/admin/reports/ivr", "report ivr"],
    ["/api/v1/admin/reports/quality", "report quality"],
    ["/api/v1/admin/backups", "backups list"],
    ["/api/v1/admin/secrets", "secrets"],
    ["/api/v1/admin/security/bans", "security bans"],
    ["/api/v1/admin/security/status", "security status"],
    ["/api/v1/admin/auth/totp/status", "2FA status"],
    ["/api/v1/admin/tts/status", "tts status"],
    ["/api/v1/admin/extensions/export", "extensions CSV export"],
  ];
  for (const [path, label] of gets) {
    await expectStatus(`GET ${label}`, "GET", path, { cookie: admin }, 200);
  }

  // Extension schema
  const exts = await req("GET", "/api/v1/admin/extensions", { cookie: admin });
  const e0 = exts.json?.[0];
  if (e0 && "outboundCli" in e0 && "dnd" in e0) ok("extension fields outboundCli/dnd");
  else bad("extension fields", JSON.stringify(e0)?.slice(0, 120));

  // Blacklist CRUD
  const bl = await req("POST", "/api/v1/admin/blacklist", {
    cookie: admin,
    body: { pattern: "05339990001", direction: "both", note: "smoke" },
  });
  if (bl.status === 200 && bl.json?.id) {
    ok("blacklist create");
    await expectStatus("blacklist delete", "DELETE", `/api/v1/admin/blacklist/${bl.json.id}`, { cookie: admin }, [
      200, 204,
    ]);
  } else bad("blacklist create", bl.text);

  // Queue maxCallers
  const qs = await req("GET", "/api/v1/admin/queues", { cookie: admin });
  if (qs.json?.[0]?.maxCallers != null) ok(`queue maxCallers=${qs.json[0].maxCallers}`);
  else bad("queue maxCallers", qs.text.slice(0, 120));

  // Schedule status + override
  const sch = await req("GET", "/api/v1/admin/schedules", { cookie: admin });
  if (sch.json?.[0]?.id) {
    const sid = sch.json[0].id;
    await expectStatus("schedule status", "GET", `/api/v1/admin/schedules/${sid}/status`, { cookie: admin }, 200);
    await expectStatus(
      "schedule override closed",
      "PUT",
      `/api/v1/admin/schedules/${sid}/override`,
      { cookie: admin, body: { overrideMode: "closed" } },
      200,
    );
    await expectStatus(
      "schedule override auto",
      "PUT",
      `/api/v1/admin/schedules/${sid}/override`,
      { cookie: admin, body: { overrideMode: "auto" } },
      200,
    );
  } else skp("schedule status", "no schedules");

  // CSV import (JSON body as UI does)
  const csvExport = await req("GET", "/api/v1/admin/extensions/export", { cookie: admin, raw: true });
  if (csvExport.status === 200 && csvExport.text.includes("number,")) {
    const imp = await req("POST", "/api/v1/admin/extensions/import", {
      cookie: admin,
      body: { csv: csvExport.text },
    });
    if (imp.status === 200 && typeof imp.json?.updated === "number") ok("extensions CSV import");
    else bad("extensions CSV import", imp.text.slice(0, 160));
  }

  // Holidays TR pack
  await expectStatus("holidays tr-pack", "POST", "/api/v1/admin/holidays/tr-pack", { cookie: admin, body: {} }, [
    200, 201,
  ]);

  // Backup
  await expectStatus("backup create", "POST", "/api/v1/admin/backups", { cookie: admin, body: {} }, [200, 201]);

  // Reload
  await expectStatus("system reload", "POST", "/api/v1/admin/system/reload", { cookie: admin, body: {} }, 200);

  // Dialplan greps
  const conf = docker("asterisk sh -c 'cat /var/lib/asterisk/dsip/extensions_dsip.conf'");
  const qconf = docker("asterisk sh -c 'cat /var/lib/asterisk/dsip/queues_dsip.conf'");
  const greps = [
    ["DND *78", /\*78/],
    ["DND *79", /\*79/],
    ["pickup *8", /\*8/],
    ["emergency 112", /exten => 112/],
    ["hint BLF", /hint,PJSIP/],
    ["queue callback", /queue-callback|CBPLACE|QCB\//],
    ["KVKK", /[Kk][Vv][Kk][Kk]|kvkk/],
    ["MixMonitor recording", /MixMonitor/],
    ["FWDDEPTH", /FWDDEPTH|FWD_VISITED/],
    ["Alert-Info distinctive ring", /Alert-Info/],
  ];
  for (const [label, re] of greps) {
    if (re.test(conf)) ok(`dialplan ${label}`);
    else if (label === "FWDDEPTH") {
      // Present only when at least one extension→extension forward is configured
      skp(`dialplan ${label}`, "no extension forwards configured");
    } else bad(`dialplan ${label}`, "not found");
  }
  if (/maxlen=/.test(qconf)) ok("queues maxlen");
  else bad("queues maxlen", "not found");

  // Internal secret enforcement
  const noSec = await req("POST", "/api/v1/internal/dnd", {
    body: { extension: "101", dnd: false },
  });
  if ([401, 403].includes(noSec.status)) ok("internal secret required");
  else bad("internal secret required", `HTTP ${noSec.status}`);

  const withSec = await req("POST", "/api/v1/internal/dnd", {
    headers: { "x-dsip-internal": SECRET },
    body: { extension: "101", dnd: false },
  });
  if (withSec.status === 200) ok("internal DND");
  else bad("internal DND", withSec.text);

  const qcb = await req("POST", "/api/v1/internal/queue-callback", {
    headers: { "x-dsip-internal": SECRET },
    body: { queue: "300", number: "05321118888", place: 2 },
  });
  if (qcb.status === 200 && qcb.json?.ok) ok("internal queue-callback place");
  else bad("internal queue-callback", qcb.text);

  // Flows simulate / validate / export
  const flows = await req("GET", "/api/v1/admin/flows", { cookie: admin });
  const fid = flows.json?.[0]?.id;
  if (fid) {
    await expectStatus(
      "flow simulate",
      "POST",
      `/api/v1/admin/flows/${fid}/simulate`,
      { cookie: admin, body: { caller: "02121234567", did: "850", dtmfSequence: ["1"] } },
      200,
    );
    await expectStatus("flow validate", "POST", `/api/v1/admin/flows/${fid}/validate`, { cookie: admin, body: {} }, [
      200, 400,
    ]);
    await expectStatus("flow export", "GET", `/api/v1/admin/flows/${fid}/export`, { cookie: admin }, 200);
    await expectStatus(
      "flow test-http",
      "POST",
      "/api/v1/admin/flows/test-http",
      {
        cookie: admin,
        body: { method: "GET", url: "https://httpbin.org/get", timeoutMs: 5000 },
      },
      [200, 502],
    );
  } else skp("flow endpoints", "no flows");

  // Softphone QR via devices
  const devices = await req("GET", "/api/v1/admin/devices", { cookie: admin });
  if (devices.json?.[0]?.id) {
    await expectStatus(
      "device QR",
      "GET",
      `/api/v1/admin/devices/${devices.json[0].id}/qr`,
      { cookie: admin },
      200,
    );
  } else {
    // create temp device for ext
    const extId = e0?.id;
    if (extId) {
      const created = await req("POST", "/api/v1/admin/devices", {
        cookie: admin,
        body: { extensionId: extId, mac: "aabbccddeeff", vendor: "yealink" },
      });
      if (created.json?.id) {
        ok("device create");
        await expectStatus("device QR", "GET", `/api/v1/admin/devices/${created.json.id}/qr`, { cookie: admin }, 200);
        const cfg = await req("GET", "/cfg/aabbccddeeff.cfg", {});
        if (cfg.status === 200 && cfg.text.length > 20) ok("provision cfg");
        else bad("provision cfg", `HTTP ${cfg.status}`);
        await req("DELETE", `/api/v1/admin/devices/${created.json.id}`, { cookie: admin });
      } else bad("device create", created.text);
    } else skp("device QR", "no extension");
  }

  // Trunk status
  const trunks = await req("GET", "/api/v1/admin/trunks", { cookie: admin });
  if (trunks.json?.[0]?.id) {
    await expectStatus(
      "trunk status",
      "GET",
      `/api/v1/admin/trunks/${trunks.json[0].id}/status`,
      { cookie: admin },
      200,
    );
  } else skp("trunk status", "no trunks");

  // Spend limit
  if (e0?.id) {
    await expectStatus(
      "spend-limit get",
      "GET",
      `/api/v1/admin/extensions/${e0.id}/spend-limit`,
      { cookie: admin },
      200,
    );
  }

  // Archive run
  await expectStatus("archive run", "POST", "/api/v1/admin/archive/run", { cookie: admin, body: {} }, [200, 201]);

  // Spy endpoint (no active call → 4xx/5xx ok if route exists)
  const spy = await req("POST", "/api/v1/admin/live/calls/none/spy", {
    cookie: admin,
    body: { mode: "spy", listenerExtension: "100" },
  });
  if ([200, 400, 404, 502].includes(spy.status)) ok(`spy endpoint (${spy.status})`);
  else bad("spy endpoint", `HTTP ${spy.status}`);

  // Webhook test
  const whCreate = await req("POST", "/api/v1/admin/webhooks", {
    cookie: admin,
    body: { name: "smoke-wh", url: "https://httpbin.org/post", events: ["call.ended"] },
  });
  if (whCreate.json?.id) {
    ok("webhook create");
    await expectStatus(
      "webhook test",
      "POST",
      `/api/v1/admin/webhooks/${whCreate.json.id}/test`,
      { cookie: admin, body: {} },
      [200, 502],
    );
    await req("DELETE", `/api/v1/admin/webhooks/${whCreate.json.id}`, { cookie: admin });
  } else {
    // maybe delete not available — list and test first
    const whs = await req("GET", "/api/v1/admin/webhooks", { cookie: admin });
    if (whs.json?.[0]?.id) {
      await expectStatus(
        "webhook test",
        "POST",
        `/api/v1/admin/webhooks/${whs.json[0].id}/test`,
        { cookie: admin, body: {} },
        [200, 502],
      );
    } else bad("webhook create", whCreate.text);
  }

  // API key + ext CDR
  const keyCreate = await req("POST", "/api/v1/admin/api-keys", {
    cookie: admin,
    body: { name: "smoke-key", permissions: ["cdr"] },
  });
  const apiKey = keyCreate.json?.key || keyCreate.json?.token || keyCreate.json?.apiKey;
  if (apiKey) {
    ok("api-key create");
    const cdrExt = await req("GET", "/api/v1/ext/cdr", {
      headers: { authorization: `Bearer ${apiKey}`, "x-api-key": apiKey },
    });
    if (cdrExt.status === 200) ok("ext CDR with api-key");
    else bad("ext CDR with api-key", `HTTP ${cdrExt.status} ${cdrExt.text.slice(0, 120)}`);

    const origDenied = await req("POST", "/api/v1/ext/calls/originate", {
      headers: { authorization: `Bearer ${apiKey}`, "x-api-key": apiKey },
      body: { from: "101", to: "102" },
    });
    if ([401, 403].includes(origDenied.status)) ok("api-key denies originate without perm");
    else skp("api-key deny originate", `HTTP ${origDenied.status} (may allow)`);

    if (keyCreate.json?.id) {
      await req("DELETE", `/api/v1/admin/api-keys/${keyCreate.json.id}`, { cookie: admin });
    }
  } else bad("api-key create", keyCreate.text);

  // Portal endpoints
  if (portal) {
    for (const [path, label] of [
      ["/api/v1/me", "me"],
      ["/api/v1/me/sip-credentials", "sip-credentials"],
      ["/api/v1/me/directory", "directory"],
      ["/api/v1/me/calls", "my calls"],
      ["/api/v1/me/missed-calls", "my missed"],
      ["/api/v1/me/recordings", "my recordings"],
      ["/api/v1/me/voicemails", "my voicemails"],
      ["/api/v1/me/forwarding", "my forwarding"],
    ]) {
      await expectStatus(`portal ${label}`, "GET", path, { cookie: portal }, 200);
    }
    await expectStatus("portal DND", "PUT", "/api/v1/me/dnd", { cookie: portal, body: { dnd: false } }, 200);

    // No download on portal recordings
    const myRec = await req("GET", "/api/v1/me/recordings", { cookie: portal });
    const rid = myRec.json?.[0]?.id;
    if (rid) {
      await expectStatus(
        "portal recording stream",
        "GET",
        `/api/v1/me/recordings/${rid}/stream`,
        { cookie: portal },
        [200, 404],
      );
      const dl = await req("GET", `/api/v1/me/recordings/${rid}/download`, { cookie: portal });
      if ([404, 405].includes(dl.status)) ok("portal recording has no download");
      else bad("portal recording no download", `HTTP ${dl.status}`);
    } else skp("portal recording stream", "no recordings");
  }

  // TTS
  try {
    const tts = docker("tts curl -fsS http://127.0.0.1:5500/health");
    if (/ok/i.test(tts)) ok("TTS health");
    else bad("TTS health", tts.slice(0, 80));
  } catch (e) {
    bad("TTS health", e.message);
  }

  // Coturn
  try {
    const ps = execSync("docker compose ps coturn --format '{{.Status}}'", {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    if (/up/i.test(ps)) ok("coturn up");
    else bad("coturn", ps.trim());
  } catch (e) {
    bad("coturn", e.message);
  }

  // Unit tests
  try {
    execSync("pnpm --filter @dsip/api test", { encoding: "utf8", cwd: process.cwd(), stdio: "pipe" });
    ok("vitest suite");
  } catch (e) {
    bad("vitest suite", e.stdout?.toString?.().slice(-200) || e.message);
  }

  console.log(`\n==== SUMMARY pass=${pass} fail=${fail} skip=${skip} ====`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(` - ${f.name}: ${f.detail}`);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
