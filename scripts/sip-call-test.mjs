/**
 * Minimal SIP UA for DSip Docker-network call test (no extra deps).
 *   node sip-call-test.mjs <ext> <password> --answer
 *   node sip-call-test.mjs <ext> <password> <dialExt> [dtmfDigits]
 * Env: DTMF=12  (optional digits to send via SIP INFO after answer)
 *      ANSWER_DELAY_MS=4000  (--answer: ring this long before 200 OK)
 */
import dgram from "node:dgram";
import crypto from "node:crypto";
import dns from "node:dns/promises";

const ext = process.argv[2];
const password = process.argv[3];
const mode = process.argv[4] || "--answer";
const dtmfDigits = process.env.DTMF || process.argv[5] || "";
const asteriskHost = process.env.ASTERISK_HOST || "asterisk";
const sipPort = Number(process.env.SIP_PORT || 5060);
const localPort = Number(process.env.LOCAL_PORT || (ext === "101" ? 5062 : 5063));

if (!ext || !password) {
  console.error("Usage: node sip-call-test.mjs <ext> <password> [--answer|<dial>] [dtmf]");
  process.exit(1);
}

const asteriskIp = (await dns.lookup(asteriskHost)).address;
const socket = dgram.createSocket("udp4");
await new Promise((r) => socket.bind(localPort, "0.0.0.0", r));

const ourIp = await new Promise((resolve, reject) => {
  const p = dgram.createSocket("udp4");
  p.connect(sipPort, asteriskIp, () => {
    try {
      resolve(p.address().address);
    } catch (e) {
      reject(e);
    } finally {
      p.close();
    }
  });
});

console.log(`[${ext}] ${ourIp}:${localPort} → ${asteriskIp}:${sipPort}`);

function md5(s) {
  return crypto.createHash("md5").update(s).digest("hex");
}
function branch() {
  return "z9hG4bK" + crypto.randomBytes(6).toString("hex");
}
function tag() {
  return crypto.randomBytes(4).toString("hex");
}
function parseAuth(h) {
  const params = {};
  String(h)
    .replace(/^Digest\s+/i, "")
    .split(",")
    .forEach((p) => {
      const m = p.trim().match(/^(\w+)=(?:"([^"]*)"|([^,\s]+))/);
      if (m) params[m[1]] = m[2] ?? m[3];
    });
  return params;
}
function authorization(wwwAuth, method, uri) {
  const p = parseAuth(wwwAuth);
  const ha1 = md5(`${ext}:${p.realm}:${password}`);
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
function hdr(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}
function sendRaw(text) {
  socket.send(Buffer.from(text.replace(/\r?\n/g, "\r\n")), sipPort, asteriskIp);
}
function sdp() {
  return [
    "v=0",
    `o=${ext} 1 1 IN IP4 ${ourIp}`,
    "s=DSip",
    `c=IN IP4 ${ourIp}`,
    "t=0 0",
    "m=audio 12000 RTP/AVP 0 8 101",
    "a=rtpmap:0 PCMU/8000",
    "a=rtpmap:8 PCMA/8000",
    "a=rtpmap:101 telephone-event/8000",
    "a=sendrecv",
    "",
  ].join("\r\n");
}

let regCseq = 100;
let invCseq = 200;
const regCallId = `reg-${ext}-${tag()}`;
const callCallId = `call-${ext}-${tag()}`;
const fromTag = tag();
let registered = false;
let toTag = "";
let dialog = null;
let infoCseq = 300;

function sendDtmfInfo(digit) {
  if (!dialog) return;
  const body = `Signal=${digit}\r\nDuration=250\r\n`;
  const lines = [
    `INFO ${dialog.remote} SIP/2.0`,
    hdr({
      Via: `SIP/2.0/UDP ${ourIp}:${localPort};rport;branch=${branch()}`,
      From: dialog.from,
      To: dialog.to,
      "Call-ID": dialog.callId,
      CSeq: `${infoCseq++} INFO`,
      Contact: `<sip:${ext}@${ourIp}:${localPort}>`,
      "Content-Type": "application/dtmf-relay",
      "Content-Length": String(Buffer.byteLength(body)),
    }),
    "",
    body,
  ];
  sendRaw(lines.join("\n"));
  console.log(`[${ext}] DTMF INFO ${digit}`);
}

function register(auth) {
  const uri = `sip:${asteriskIp}:${sipPort}`;
  const lines = [
    `REGISTER ${uri} SIP/2.0`,
    hdr({
      Via: `SIP/2.0/UDP ${ourIp}:${localPort};rport;branch=${branch()}`,
      From: `<sip:${ext}@${asteriskIp}>;tag=${fromTag}`,
      To: `<sip:${ext}@${asteriskIp}>`,
      "Call-ID": regCallId,
      CSeq: `${regCseq++} REGISTER`,
      Contact: `<sip:${ext}@${ourIp}:${localPort}>`,
      Expires: "300",
      "User-Agent": "DSip-TestUA/1.0",
      "Content-Length": "0",
      ...(auth ? { Authorization: auth } : {}),
    }),
    "",
    "",
  ];
  sendRaw(lines.join("\n"));
  console.log(`[${ext}] REGISTER`);
}

function invite(target, auth) {
  const uri = `sip:${target}@${asteriskIp}`;
  const body = sdp();
  const lines = [
    `INVITE ${uri} SIP/2.0`,
    hdr({
      Via: `SIP/2.0/UDP ${ourIp}:${localPort};rport;branch=${branch()}`,
      From: `<sip:${ext}@${asteriskIp}>;tag=${fromTag}`,
      To: `<sip:${target}@${asteriskIp}>`,
      "Call-ID": callCallId,
      CSeq: `${invCseq++} INVITE`,
      Contact: `<sip:${ext}@${ourIp}:${localPort}>`,
      "Content-Type": "application/sdp",
      "Content-Length": String(Buffer.byteLength(body)),
      "User-Agent": "DSip-TestUA/1.0",
      Allow: "INVITE, ACK, BYE, CANCEL, OPTIONS",
      ...(auth ? { Authorization: auth } : {}),
    }),
    "",
    body,
  ];
  sendRaw(lines.join("\n"));
  console.log(`[${ext}] INVITE ${target}`);
}

function reply(req, code, reason, extra = {}, body = "") {
  const reqTo = /To:\s*(.+)/i.exec(req)?.[1]?.trim() || "";
  const to = reqTo.includes("tag=") ? reqTo : `${reqTo};tag=${tag()}`;
  if (!toTag && to.includes("tag=")) toTag = /tag=([^;>\s]+)/.exec(to)?.[1] || "";
  const text = [
    `SIP/2.0 ${code} ${reason}`,
    `Via: ${/Via:\s*(.+)/i.exec(req)?.[1]?.trim()}`,
    `From: ${/From:\s*(.+)/i.exec(req)?.[1]?.trim()}`,
    `To: ${to}`,
    `Call-ID: ${/Call-ID:\s*(.+)/i.exec(req)?.[1]?.trim()}`,
    `CSeq: ${/CSeq:\s*(.+)/i.exec(req)?.[1]?.trim()}`,
    `Contact: <sip:${ext}@${ourIp}:${localPort}>`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    `Content-Length: ${Buffer.byteLength(body)}`,
    "",
    body,
  ].join("\r\n");
  // reply to source of request (asterisk)
  socket.send(Buffer.from(text), sipPort, asteriskIp);
}

socket.on("message", (buf) => {
  const msg = buf.toString("utf8");
  const first = msg.split("\r\n")[0] || msg.split("\n")[0];
  console.log(`[${ext}] ← ${first}`);

  if (msg.startsWith("SIP/2.0")) {
    const code = Number(first.split(" ")[1]);
    const isReg = /CSeq:\s*\d+\s+REGISTER/i.test(msg);
    const isInv = /CSeq:\s*\d+\s+INVITE/i.test(msg);
    if (isReg) {
      if (code === 401 || code === 407) {
        const www = /WWW-Authenticate:\s*(.+)/i.exec(msg)?.[1]?.trim();
        register(authorization(www, "REGISTER", `sip:${asteriskIp}:${sipPort}`));
      } else if (code === 200) {
        registered = true;
        console.log(`[${ext}] REGISTERED OK`);
        // Digits or feature codes (*78, *79, …)
        if (/^[\d*#]+$/.test(mode)) setTimeout(() => invite(mode), 800);
      } else if (code >= 400) {
        console.error(`[${ext}] REGISTER FAILED`);
        process.exit(1);
      }
    }
    if (isInv) {
      if (code === 401 || code === 407) {
        const www = /WWW-Authenticate:\s*(.+)/i.exec(msg)?.[1]?.trim();
        invite(mode, authorization(www, "INVITE", `sip:${mode}@${asteriskIp}`));
      } else if (code === 180 || code === 183) {
        console.log(`[${ext}] ringing`);
      } else if (code === 200) {
        console.log(`[${ext}] CALL ANSWERED`);
        const contact = /Contact:\s*<?([^>;\r\n]+)/i.exec(msg)?.[1] || `sip:${mode}@${asteriskIp}`;
        const fromH = /From:\s*(.+)/i.exec(msg)?.[1]?.trim();
        const toH = /To:\s*(.+)/i.exec(msg)?.[1]?.trim();
        const cid = /Call-ID:\s*(.+)/i.exec(msg)?.[1]?.trim();
        dialog = { remote: contact, from: fromH, to: toH, callId: cid };
        const ack = [
          `ACK ${contact} SIP/2.0`,
          hdr({
            Via: `SIP/2.0/UDP ${ourIp}:${localPort};rport;branch=${branch()}`,
            From: fromH,
            To: toH,
            "Call-ID": cid,
            CSeq: `${/CSeq:\s*(\d+)/i.exec(msg)?.[1]} ACK`,
            "Content-Length": "0",
          }),
          "",
          "",
        ].join("\n");
        sendRaw(ack);
        // DTMF_PHASES="9000:1;14000:1234" → digit groups at absolute ms after answer
        // else DTMF / argv digits with DTMF_DELAY_MS then 500ms spacing
        const phases = process.env.DTMF_PHASES
          ? process.env.DTMF_PHASES.split(";")
              .map((p) => p.trim())
              .filter(Boolean)
              .map((p) => {
                const [ms, digs] = p.split(":");
                return { at: Number(ms), digs: digs || "" };
              })
          : dtmfDigits
            ? [{ at: Number(process.env.DTMF_DELAY_MS || 1200), digs: dtmfDigits }]
            : [];
        let lastAt = 0;
        for (const ph of phases) {
          let t = ph.at;
          for (const d of ph.digs) {
            setTimeout(() => sendDtmfInfo(d), t);
            t += Number(process.env.DTMF_GAP_MS || 500);
            lastAt = t;
          }
        }
        const holdMs = Number(
          process.env.CALL_HOLD_MS ||
            (phases.length ? Math.max(14000, lastAt + 8000) : 2500),
        );
        setTimeout(() => {
          if (dialog) {
            const bye = [
              `BYE ${dialog.remote} SIP/2.0`,
              hdr({
                Via: `SIP/2.0/UDP ${ourIp}:${localPort};rport;branch=${branch()}`,
                From: dialog.from,
                To: dialog.to,
                "Call-ID": dialog.callId,
                CSeq: `${invCseq++} BYE`,
                "Content-Length": "0",
              }),
              "",
              "",
            ].join("\n");
            sendRaw(bye);
            console.log(`[${ext}] BYE`);
          }
          console.log(`[${ext}] SUCCESS`);
          setTimeout(() => process.exit(0), 400);
        }, holdMs);
      } else if (code >= 400) {
        console.error(`[${ext}] CALL FAILED ${code}`);
        process.exit(2);
      }
    }
    return;
  }

  if (msg.startsWith("INVITE ")) {
    if (process.env.BUSY === "1") {
      console.log(`[${ext}] Incoming INVITE — busy (486)`);
      reply(msg, 100, "Trying");
      reply(msg, 486, "Busy Here");
    } else if (process.env.NO_ANSWER === "1") {
      console.log(`[${ext}] Incoming INVITE — ringing only (NO_ANSWER)`);
      reply(msg, 100, "Trying");
      reply(msg, 180, "Ringing");
    } else {
      const delay = Number(process.env.ANSWER_DELAY_MS || 0);
      console.log(`[${ext}] Incoming INVITE — answering${delay ? ` in ${delay}ms` : ""}`);
      reply(msg, 100, "Trying");
      if (delay) reply(msg, 180, "Ringing");
      setTimeout(() => reply(msg, 200, "OK", { "Content-Type": "application/sdp" }, sdp()), delay);
    }
  } else if (msg.startsWith("ACK ")) {
    console.log(`[${ext}] ACK — call up`);
  } else if (msg.startsWith("BYE ")) {
    reply(msg, 200, "OK");
    console.log(`[${ext}] BYE`);
    setTimeout(() => process.exit(0), 300);
  } else if (msg.startsWith("OPTIONS ")) {
    reply(msg, 200, "OK");
  }
});

register();
setTimeout(() => {
  if (!registered) {
    console.error(`[${ext}] register timeout`);
    process.exit(1);
  }
}, 10000);
setTimeout(() => {
  console.error(`[${ext}] timeout`);
  process.exit(1);
}, 40000);
