#!/usr/bin/env node
/**
 * Probe SIP REGISTER over WSS.
 * Usage: node sip-wss-register-probe.mjs <wssUrl> <ext> <password> <domain>
 */
import WebSocket from "ws";
import crypto from "crypto";

const [wssUrl, ext, pass, domain] = process.argv.slice(2);
if (!wssUrl || !ext || !pass || !domain) {
  console.error("Usage: node sip-wss-register-probe.mjs <wssUrl> <ext> <password> <domain>");
  process.exit(1);
}

function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex");
}
function parseAuth(h) {
  const p = {};
  String(h)
    .replace(/^Digest\s+/i, "")
    .split(",")
    .forEach((x) => {
      const m = x.trim().match(/^(\w+)=(?:"([^"]*)"|([^,\s]+))/);
      if (m) p[m[1]] = m[2] ?? m[3];
    });
  return p;
}
function authHeader(www, method, uri) {
  const p = parseAuth(www);
  console.log("challenge", JSON.stringify(p));
  const ha1 = md5(`${ext}:${p.realm}:${pass}`);
  const ha2 = md5(`${method}:${uri}`);
  const nc = "00000001";
  const cnonce = crypto.randomBytes(4).toString("hex");
  const resp = p.qop
    ? md5(`${ha1}:${p.nonce}:${nc}:${cnonce}:${p.qop}:${ha2}`)
    : md5(`${ha1}:${p.nonce}:${ha2}`);
  let out = `Digest username="${ext}", realm="${p.realm}", nonce="${p.nonce}", uri="${uri}", response="${resp}", algorithm=MD5`;
  if (p.opaque) out += `, opaque="${p.opaque}"`;
  if (p.qop) out += `, qop=${p.qop}, nc=${nc}, cnonce="${cnonce}"`;
  return out;
}

const callId = "probe-" + crypto.randomBytes(6).toString("hex");
const fromTag = crypto.randomBytes(4).toString("hex");
let cseq = 1;
const ws = new WebSocket(wssUrl, "sip", { handshakeTimeout: 10000 });

function reg(auth) {
  const uri = `sip:${domain}`;
  const lines = [
    `REGISTER ${uri} SIP/2.0`,
    `Via: SIP/2.0/WSS ${domain};branch=z9hG4bK${crypto.randomBytes(6).toString("hex")}`,
    `From: <sip:${ext}@${domain}>;tag=${fromTag}`,
    `To: <sip:${ext}@${domain}>`,
    `Call-ID: ${callId}`,
    `CSeq: ${cseq++} REGISTER`,
    `Contact: <sip:${ext}@abcdef01.invalid;transport=ws>;expires=300`,
    `Expires: 300`,
    `Content-Length: 0`,
  ];
  if (auth) lines.splice(7, 0, `Authorization: ${auth}`);
  const body = lines.join("\r\n") + "\r\n\r\n";
  console.log(">> REGISTER", auth ? "auth" : "plain");
  ws.send(body);
}

ws.on("open", () => reg());
ws.on("message", (data) => {
  const msg = data.toString();
  const first = msg.split("\r\n")[0];
  console.log("<<", first);
  if (/401|407/.test(first) && cseq <= 2) {
    const www =
      /WWW-Authenticate:\s*(.+)/i.exec(msg)?.[1]?.trim() ||
      /Proxy-Authenticate:\s*(.+)/i.exec(msg)?.[1]?.trim();
    reg(authHeader(www, "REGISTER", `sip:${domain}`));
    return;
  }
  if (/200/.test(first)) {
    console.log("REGISTER_OK");
    process.exit(0);
  }
  console.log(msg.slice(0, 800));
  process.exit(2);
});
ws.on("error", (e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
setTimeout(() => {
  console.error("TIMEOUT");
  process.exit(3);
}, 12000);
