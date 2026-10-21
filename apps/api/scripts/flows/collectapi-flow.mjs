#!/usr/bin/env node
/**
 * Create / update the "Bilgi Hattı" IVR: Turkish public-info services from
 * CollectAPI (https://collectapi.com/tr) read out over the phone.
 *
 *   1 Nöbetçi eczane   2 Akaryakıt   3 Hava durumu   (caller keys the province plate code)
 *   4 Döviz            5 Altın       6 Borsa İstanbul
 *   0 Çıkış
 *
 * The API key is stored encrypted in DSip's secrets table (sent as
 * `authorization: apikey <key>`), never in the flow JSON or in git.
 *
 * Run:
 *   COLLECTAPI_KEY=... BASE_URL=https://pbx.example.com \
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... \
 *   node apps/api/scripts/flows/collectapi-flow.mjs
 * Env: FLOW_EXTENSION (default 901), FLOW_NAME (default "Bilgi Hattı (CollectAPI)"),
 *      FLOW_VOICE (default ema-lightning — offline neural Turkish).
 *
 * CollectAPI allows ~1 request/second, so consecutive API nodes are separated by
 * a spoken prompt.
 */
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.COLLECTAPI_KEY;
const EXT = process.env.FLOW_EXTENSION ?? "901";
const NAME = process.env.FLOW_NAME ?? "Bilgi Hattı (CollectAPI)";
const SECRET_NAME = "CollectAPI";
/** Offline neural Turkish voice (Settings → "IVR TTS model" must not force one voice for all). */
const VOICE = process.env.FLOW_VOICE ?? "ema-lightning";
if (!KEY) throw new Error("COLLECTAPI_KEY is required");

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

// ── Per-node voices only work when Settings → "IVR TTS model" is not forced on
// every node (ttsVoiceApplyAll, default true). Nodes left on "default" keep the
// system voice, so other flows are unaffected.
const settings = (await call("GET", "/api/v1/admin/settings")) ?? {};
if (settings.ttsVoiceApplyAll !== false) {
  await call("PATCH", "/api/v1/admin/settings", { ttsVoiceApplyAll: false });
  console.log(`Settings: ttsVoiceApplyAll → false (so this flow can use ${VOICE})`);
}

// ── Secret: replace an existing one with the same name so the key can rotate ──
const secrets = (await call("GET", "/api/v1/admin/secrets")) ?? [];
for (const s of secrets.filter((s) => s.name === SECRET_NAME)) {
  await call("DELETE", `/api/v1/admin/secrets/${s.id}`);
}
const secret = await call("POST", "/api/v1/admin/secrets", { name: SECRET_NAME, value: `apikey ${KEY}` });

// ── Flow graph ────────────────────────────────────────────────────────────────
const API = "https://api.collectapi.com";
const nodes = [];
const edges = [];
const at = (col, row) => ({ x: 80 + col * 270, y: 60 + row * 150 });
const add = (id, type, data, pos) => nodes.push({ id, type, position: pos, data: { label: data.label ?? id, ...data } });
const link = (source, target, handle = "next") =>
  edges.push({ id: `e-${source}-${handle}-${target}`, source, target, sourceHandle: handle, label: handle });
const say = (id, text, pos, label) => add(id, "announce", { text, language: "tr", gender: VOICE, label }, pos);
/** Spoken before a lookup so the caller knows the pause is the query. */
const QUERYING = "Sorguluyorum, lütfen bekleyin.";
const querying = (id, pos) => say(id, QUERYING, pos, "Sorguluyorum");
const api = (id, url, mappings, pos, label) =>
  add(
    id,
    "api",
    {
      label,
      method: "GET",
      url,
      headers: { "content-type": "application/json" },
      authType: "header",
      authHeader: "authorization",
      secretId: secret.id,
      timeoutMs: 6000,
      retry: 1,
      mappings: mappings.map(([path, v]) => ({ path, var: v })),
    },
    pos,
  );

add("start", "start", { label: "Başlangıç" }, at(0, 2));
add("lang", "language", { language: "tr", label: "Türkçe" }, at(0, 3));
say("hosgeldin", "Bilgi hattına hoş geldiniz.", at(0, 4), "Hoş geldiniz");
add(
  "menu",
  "menu",
  {
    label: "Ana menü",
    prompt:
      "Nöbetçi eczane için 1, akaryakıt fiyatları için 2, hava durumu için 3, döviz kurları için 4, " +
      "altın fiyatları için 5, Borsa İstanbul için 6. Çıkmak için sıfıra basın.",
    language: "tr",
    gender: VOICE,
    digits: ["1", "2", "3", "4", "5", "6", "0"],
    maxDigits: 1,
    retries: 2,
    timeoutMs: 9000,
  },
  at(1, 3),
);
say("cikis", "Bizi aradığınız için teşekkür ederiz. İyi günler.", at(1, 6), "Çıkış");
add("kapat", "hangup", { label: "Kapat" }, at(1, 7));
say("apiHata", "Şu anda bilgi alınamıyor. Lütfen daha sonra tekrar deneyin.", at(7, 6), "API hatası");

link("start", "lang");
link("lang", "hosgeldin");
link("hosgeldin", "menu");
for (const h of ["0", "timeout", "invalid"]) link("menu", "cikis", h);
link("cikis", "kapat");
link("apiHata", "menu");

/** Province-based service: plate code → province → API → speech → menu. */
function provinceChain(key, row, digit, title, buildApiNodes) {
  const p = `${key}Plaka`;
  add(
    p,
    "get_key",
    {
      label: `${title}: plaka`,
      name: "plaka",
      prompt: "Lütfen ilinizin plaka kodunu tuşlayın. Örneğin Ankara için sıfır altı.",
      language: "tr",
      gender: VOICE,
      maxDigits: 2,
      minDigits: 1,
      timeoutMs: 10000,
    },
    at(2, row),
  );
  add(`${key}Il`, "set_var", { label: "Plaka → il", name: "il", value: "{{plaka|il}}" }, at(3, row));
  add(`${key}IlYok`, "condition", { label: "Geçerli il mi?", variable: "il", op: "empty", value: "" }, at(4, row));
  say(`${key}PlakaHata`, "Geçersiz plaka kodu. Lütfen 1 ile 81 arasında bir kod girin.", at(4, row + 0.6), "Geçersiz plaka");
  link("menu", p, digit);
  link(p, `${key}Il`);
  link(p, "menu", "timeout");
  link(`${key}Il`, `${key}IlYok`);
  link(`${key}IlYok`, `${key}PlakaHata`, "true");
  link(`${key}PlakaHata`, p);
  const first = buildApiNodes(row);
  querying(`${key}Sorgu`, at(4.5, row - 0.6));
  link(`${key}IlYok`, `${key}Sorgu`, "false");
  link(`${key}Sorgu`, first);
}

// 1 · Nöbetçi eczane
provinceChain("ecz", 0, "1", "Nöbetçi eczane", (row) => {
  api(
    "eczApi",
    `${API}/health/dutyPharmacy?il=$il`,
    [
      ["$.result.0.name", "e1"],
      ["$.result.0.dist", "d1"],
      ["$.result.0.address", "a1"],
      ["$.result.0.phone", "t1"],
      ["$.result.1.name", "e2"],
      ["$.result.1.dist", "d2"],
      ["$.result.1.phone", "t2"],
    ],
    at(5, row),
    "Nöbetçi eczane API",
  );
  add("eczBos", "condition", { label: "Sonuç var mı?", variable: "e1", op: "empty", value: "" }, at(6, row));
  say("eczYok", "$il için nöbetçi eczane bilgisi bulunamadı.", at(7, row - 0.4), "Eczane yok");
  say(
    "eczSoyle",
    "$il nöbetçi eczaneleri. Birinci: $e1, $d1. Adres: $a1. Telefon: {{t1|rakam}}. " +
      "İkinci: $e2, $d2. Telefon: {{t2|rakam}}.",
    at(7, row + 0.4),
    "Eczaneleri oku",
  );
  link("eczApi", "eczBos", "success");
  link("eczApi", "apiHata", "error");
  link("eczBos", "eczYok", "true");
  link("eczBos", "eczSoyle", "false");
  link("eczYok", "menu");
  link("eczSoyle", "menu");
  return "eczApi";
});

// 2 · Akaryakıt (3 calls, a spoken line between each — 1 req/s limit)
provinceChain("aka", 1, "2", "Akaryakıt", (row) => {
  api("akaBenzin", `${API}/gasPrice/turkeyGasoline?city={{il|ascii}}`, [["$.result.0.benzin", "benzin"], ["$.result.0.marka", "marka"]], at(5, row), "Benzin API");
  add("akaBos", "condition", { label: "Sonuç var mı?", variable: "benzin", op: "empty", value: "" }, at(6, row));
  say("akaYok", "$il için akaryakıt fiyatı bulunamadı.", at(7, row - 0.4), "Fiyat yok");
  say("akaBenzinSoyle", "$il akaryakıt fiyatları, $marka. Benzin litresi {{benzin|tl}} lira.", at(7, row + 0.4), "Benzini oku");
  api("akaDizel", `${API}/gasPrice/turkeyDiesel?city={{il|ascii}}`, [["$.result.0.dizel", "dizel"]], at(8, row), "Motorin API");
  say("akaDizelSoyle", "Motorin litresi {{dizel|tl}} lira.", at(9, row), "Motorini oku");
  api("akaLpg", `${API}/gasPrice/turkeyLpg?city={{il|ascii}}`, [["$.result.0.lpg", "lpg"]], at(10, row), "LPG API");
  say("akaLpgSoyle", "LPG litresi {{lpg|tl}} lira.", at(11, row), "LPG'yi oku");
  link("akaBenzin", "akaBos", "success");
  link("akaBenzin", "apiHata", "error");
  link("akaBos", "akaYok", "true");
  link("akaBos", "akaBenzinSoyle", "false");
  link("akaYok", "menu");
  link("akaBenzinSoyle", "akaDizel");
  link("akaDizel", "akaDizelSoyle", "success");
  link("akaDizel", "akaLpg", "error");
  link("akaDizelSoyle", "akaLpg");
  link("akaLpg", "akaLpgSoyle", "success");
  link("akaLpg", "menu", "error");
  link("akaLpgSoyle", "menu");
  return "akaBenzin";
});

// 3 · Hava durumu (response is a bare array)
provinceChain("hava", 2, "3", "Hava durumu", (row) => {
  api(
    "havaApi",
    `${API}/weather/getWeather?data.lang=tr&data.city=$il`,
    [
      ["$.0.description", "durum"],
      ["$.0.degree", "derece"],
      ["$.0.min", "enDusuk"],
      ["$.0.max", "enYuksek"],
    ],
    at(5, row),
    "Hava durumu API",
  );
  add("havaBos", "condition", { label: "Sonuç var mı?", variable: "derece", op: "empty", value: "" }, at(6, row));
  say("havaYok", "$il için hava durumu bulunamadı.", at(7, row - 0.4), "Hava yok");
  say(
    "havaSoyle",
    "$il için bugün hava $durum. Sıcaklık {{derece|tamsayi}} derece. " +
      "En düşük {{enDusuk|tamsayi}}, en yüksek {{enYuksek|tamsayi}} derece.",
    at(7, row + 0.4),
    "Havayı oku",
  );
  link("havaApi", "havaBos", "success");
  link("havaApi", "apiHata", "error");
  link("havaBos", "havaYok", "true");
  link("havaBos", "havaSoyle", "false");
  link("havaYok", "menu");
  link("havaSoyle", "menu");
  return "havaApi";
});

// 4 · Döviz (allCurrency: 0 USD, 1 EUR, 2 GBP)
api(
  "dovizApi",
  `${API}/economy/allCurrency`,
  [
    ["$.result.0.buying", "usdAl"],
    ["$.result.0.selling", "usdSat"],
    ["$.result.1.buying", "eurAl"],
    ["$.result.1.selling", "eurSat"],
    ["$.result.2.buying", "gbpAl"],
    ["$.result.2.selling", "gbpSat"],
  ],
  at(2, 4),
  "Döviz API",
);
say(
  "dovizSoyle",
  "Döviz kurları. Dolar alış {{usdAl|tl}}, satış {{usdSat|tl}} lira. " +
    "Euro alış {{eurAl|tl}}, satış {{eurSat|tl}} lira. Sterlin alış {{gbpAl|tl}}, satış {{gbpSat|tl}} lira.",
  at(3, 4),
  "Kurları oku",
);
querying("dovizSorgu", at(1.5, 4 + 0.5));
link("menu", "dovizSorgu", "4");
link("dovizSorgu", "dovizApi");
link("dovizApi", "dovizSoyle", "success");
link("dovizApi", "apiHata", "error");
link("dovizSoyle", "menu");

// 5 · Altın (goldPrice: 0 gram, 2 çeyrek, 4 tam)
api(
  "altinApi",
  `${API}/economy/goldPrice`,
  [
    ["$.result.0.selling", "gram"],
    ["$.result.2.selling", "ceyrek"],
    ["$.result.4.selling", "tam"],
  ],
  at(2, 5),
  "Altın API",
);
say(
  "altinSoyle",
  "Altın satış fiyatları. Gram altın {{gram|tl}} lira. Çeyrek altın {{ceyrek|tl}} lira. Tam altın {{tam|tl}} lira.",
  at(3, 5),
  "Altını oku",
);
querying("altinSorgu", at(1.5, 5 + 0.5));
link("menu", "altinSorgu", "5");
link("altinSorgu", "altinApi");
link("altinApi", "altinSoyle", "success");
link("altinApi", "apiHata", "error");
link("altinSoyle", "menu");

// 6 · Borsa İstanbul (BIST 100)
api(
  "borsaApi",
  `${API}/economy/borsaIstanbul`,
  [
    ["$.result.0.current", "bist"],
    ["$.result.0.changerate", "degisim"],
  ],
  at(2, 6),
  "Borsa API",
);
say(
  "borsaSoyle",
  "Borsa İstanbul yüz endeksi {{bist|tamsayi}} puan. Günlük değişim yüzde {{degisim|tl}}.",
  at(3, 6),
  "Borsayı oku",
);
querying("borsaSorgu", at(1.5, 6 + 0.5));
link("menu", "borsaSorgu", "6");
link("borsaSorgu", "borsaApi");
link("borsaApi", "borsaSoyle", "success");
link("borsaApi", "apiHata", "error");
link("borsaSoyle", "menu");

// ── Create or update, validate, publish ───────────────────────────────────────
const flows = (await call("GET", "/api/v1/admin/flows")) ?? [];
let flow = flows.find((f) => f.name === NAME);
if (!flow) flow = await call("POST", "/api/v1/admin/flows", { name: NAME, extensionNumber: EXT });
else await call("PATCH", `/api/v1/admin/flows/${flow.id}`, { extensionNumber: EXT });
await call("PUT", `/api/v1/admin/flows/${flow.id}/draft`, { nodes, edges, variables: ["caller", "did", "time"] });
const v = await call("POST", `/api/v1/admin/flows/${flow.id}/validate`);
if (!v.ok) throw new Error(`validation failed: ${v.errors.join("; ")}`);
const pub = await call("POST", `/api/v1/admin/flows/${flow.id}/publish`);
console.log(`"${NAME}" published v${pub.version} on extension ${EXT} (${nodes.length} nodes, ${edges.length} edges, secret ${secret.id})`);
