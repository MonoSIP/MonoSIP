#!/usr/bin/env node
/**
 * Create / update the "Main line" demo IVR: welcome, a menu that sends callers to
 * sales or the support queue, and a live exchange-rate lookup read out loud.
 *
 *   1 Sales (transfer)   2 Support (queue)   3 Exchange rates (HTTP API)   0 Goodbye
 *
 * The rates come from the free Frankfurter API (no key). Shows the API node with
 * JSON mappings, an If on the result, a "one moment" prompt before the lookup and
 * a Pause node.
 *
 * Run:
 *   BASE_URL=https://pbx.example.com ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... \
 *   node apps/api/scripts/flows/demo-flow.mjs
 * Env: FLOW_EXTENSION (default 902), SALES_EXT (default 102), SUPPORT_QUEUE (default 300).
 */
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EXT = process.env.FLOW_EXTENSION ?? "902";
const NAME = process.env.FLOW_NAME ?? "Main line";
const SALES = process.env.SALES_EXT ?? "102";
const QUEUE = process.env.SUPPORT_QUEUE ?? "300";

let cookie = "";
async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? { cookie } : { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

await call("POST", "/api/v1/admin/auth/login", {
  email: process.env.ADMIN_EMAIL ?? "admin@example.com",
  password: process.env.ADMIN_PASSWORD ?? "Admin123!",
});

const nodes = [];
const edges = [];
const at = (col, row) => ({ x: 60 + col * 280, y: 60 + row * 150 });
const add = (id, type, data, pos) => nodes.push({ id, type, position: pos, data: { label: data.label ?? id, ...data } });
const link = (source, target, handle = "next") =>
  edges.push({ id: `e-${source}-${handle}-${target}`, source, target, sourceHandle: handle, label: handle });
const say = (id, text, pos, label) => add(id, "announce", { text, language: "en", gender: "female", label }, pos);

add("start", "start", { label: "Start" }, at(0, 1));
add("lang", "language", { language: "en", label: "English" }, at(0, 2));
say("welcome", "Thank you for calling Acme.", at(0, 3), "Welcome");
add(
  "menu",
  "menu",
  {
    label: "Main menu",
    prompt: "For sales, press 1. For support, press 2. For today's exchange rates, press 3. To end the call, press 0.",
    language: "en",
    gender: "female",
    digits: ["1", "2", "3", "0"],
    maxDigits: 1,
    retries: 2,
    timeoutMs: 8000,
  },
  at(1, 2),
);
add("sales", "transfer", { label: "Sales", destType: "extension", destId: SALES, timeout: 25 }, at(2, 0));
add("support", "queue", { label: "Support queue", queueNumber: QUEUE }, at(2, 1));
say("lookup", "One moment, I'm looking that up.", at(2, 2.2), "One moment");
add(
  "rates",
  "api",
  {
    label: "Exchange rates API",
    method: "GET",
    url: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP",
    headers: {},
    authType: "none",
    timeoutMs: 5000,
    retry: 1,
    mappings: [
      { path: "$.rates.EUR", var: "eur" },
      { path: "$.rates.GBP", var: "gbp" },
    ],
  },
  at(3, 2.2),
);
add("hasRate", "condition", { label: "Got a rate?", variable: "eur", op: "empty", value: "" }, at(4, 2.2));
say("readRates", "One US dollar is {{eur}} euros, or {{gbp}} British pounds.", at(5, 1.6), "Read the rates");
say("noRates", "Sorry, the rates are not available right now.", at(5, 2.8), "No rates");
add("pause", "wait", { label: "Short pause", seconds: 1, moh: "" }, at(6, 2.2));
say("bye", "Thanks for calling. Goodbye.", at(1, 4), "Goodbye");
add("hangup", "hangup", { label: "Hang up" }, at(2, 4));
for (const [h, t] of [["noanswer", "bye"], ["busy", "bye"], ["chanunavail", "bye"]]) link("sales", t, h);

link("start", "lang");
link("lang", "welcome");
link("welcome", "menu");
link("menu", "sales", "1");
link("menu", "support", "2");
link("menu", "lookup", "3");
for (const h of ["0", "timeout", "invalid"]) link("menu", "bye", h);
link("lookup", "rates");
link("rates", "hasRate", "success");
link("rates", "noRates", "error");
link("hasRate", "noRates", "true");
link("hasRate", "readRates", "false");
link("readRates", "pause");
link("noRates", "pause");
link("pause", "menu");
link("bye", "hangup");
for (const h of ["timeout", "full", "joinempty"]) link("support", "bye", h);

const flows = (await call("GET", "/api/v1/admin/flows")) ?? [];
let flow = flows.find((f) => f.name === NAME);
if (!flow) flow = await call("POST", "/api/v1/admin/flows", { name: NAME, extensionNumber: EXT });
else await call("PATCH", `/api/v1/admin/flows/${flow.id}`, { extensionNumber: EXT });
await call("PUT", `/api/v1/admin/flows/${flow.id}/draft`, { nodes, edges, variables: ["caller", "did", "time"] });
const v = await call("POST", `/api/v1/admin/flows/${flow.id}/validate`);
if (!v.ok) throw new Error(`validation failed: ${v.errors.join("; ")}`);
const pub = await call("POST", `/api/v1/admin/flows/${flow.id}/publish`);
console.log(`"${NAME}" published v${pub.version} on extension ${EXT} (${nodes.length} nodes, ${edges.length} edges)`);
