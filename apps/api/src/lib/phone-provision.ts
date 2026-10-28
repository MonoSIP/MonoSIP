/** Desk-phone autoprovision body. BLF watches up to 8 other extensions. */

export type ProvisionPeer = { number: string; name: string };

const BLF_KEYS = 8;

function oneLine(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

function xmlText(value: string): string {
  return oneLine(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function blfPeers(self: string, peers: ProvisionPeer[]): ProvisionPeer[] {
  return peers.filter((p) => p.number !== self).slice(0, BLF_KEYS);
}

function yealink(self: { number: string; name: string; password: string }, host: string, peers: ProvisionPeer[]): string {
  const lines = [
    "#!version:1.0.0.1",
    // The PBX certificate is self-signed. Leave the check on and TLS registration fails.
    "static.security.trust_certificates = 0",
    "static.security.cn_validation = 0",
    "account.1.enable = 1",
    `account.1.label = ${oneLine(self.name)}`,
    `account.1.display_name = ${oneLine(self.name)}`,
    `account.1.auth_name = ${self.number}`,
    `account.1.user_name = ${self.number}`,
    `account.1.password = ${oneLine(self.password)}`,
    `account.1.sip_server.1.address = ${oneLine(host)}`,
    "account.1.sip_server.1.port = 5061",
    "account.1.sip_server.1.transport_type = 2",
    "account.1.srtp_encryption = 1",
    "account.1.outbound_proxy_enable = 0",
  ];
  peers.forEach((p, i) => {
    const n = i + 1;
    const pickup = `*8${p.number}`;
    lines.push(
      `linekey.${n}.type = 16`,
      `linekey.${n}.line = 1`,
      `linekey.${n}.value = ${p.number}`,
      `linekey.${n}.label = ${oneLine(p.name) || p.number}`,
      // Yealink: extension / pickup_value is the directed pickup code, not the watched number.
      `linekey.${n}.extension = ${pickup}`,
      `linekey.${n}.pickup_value = ${pickup}`,
    );
  });
  return lines.join("\n");
}

/** Classic Fanvil cfg. Fkey value `102@1/bd*8102` is BLF/DTMF on line 1 with pickup *8102. */
function fanvil(self: { number: string; name: string; password: string }, host: string, peers: ProvisionPeer[]): string {
  const lines = [
    "<<VOIP CONFIG FILE>>Version:2.0002",
    "",
    "<SIP CONFIG MODULE>",
    "--SIP Line List--  :",
    "SIP1 Enable Reg    :1",
    `SIP1 Phone Number  :${self.number}`,
    `SIP1 Display Name  :${oneLine(self.name)}`,
    `SIP1 Register Addr :${oneLine(host)}`,
    "SIP1 Register Port :5061",
    `SIP1 Register User :${self.number}`,
    `SIP1 Register Pswd :${oneLine(self.password)}`,
    "SIP1 Transport     :2",
    "SIP1 SRTP          :1",
    "",
    "<PHONE CONFIG MODULE>",
    "--Function Key--   :",
  ];
  peers.forEach((p, i) => {
    const n = i + 1;
    lines.push(
      `Fkey${n} Type         :1`,
      `Fkey${n} Value        :${p.number}@1/bd*8${p.number}`,
      `Fkey${n} Title        :${oneLine(p.name) || p.number}`,
    );
  });
  lines.push(
    "",
    "<TRUSTED CERTIFICATES>",
    "Permission Certificate :0",
    "Common Name Validation :0",
    "",
    "<<END OF FILE>>",
  );
  return lines.join("\n");
}

/**
 * Grandstream XML (GXP16xx line keys). Mode 11 is BLF.
 * Key n uses P(1363+2(n-1)) mode, P(1364+2(n-1)) account, P(1465+2(n-1)) label, P(1466+2(n-1)) value.
 * P6752/P1347: dial *8 + the watched number when the lamp is ringing.
 */
function grandstream(self: { number: string; name: string; password: string }, host: string, peers: ProvisionPeer[]): string {
  const items: string[] = [
    "<P271>1</P271>",
    `<P270>${xmlText(self.name)}</P270>`,
    `<P47>${xmlText(host)}</P47>`,
    `<P35>${xmlText(self.number)}</P35>`,
    `<P36>${xmlText(self.number)}</P36>`,
    `<P34>${xmlText(self.password)}</P34>`,
    `<P3>${xmlText(self.name)}</P3>`,
    "<P40>5060</P40>",
    "<P130>2</P130>",
    "<P2329>0</P2329>",
    "<P183>1</P183>",
    "<P6752>1</P6752>",
    "<P1347>*8</P1347>",
  ];
  peers.forEach((p, i) => {
    const mode = 1363 + i * 2;
    const account = 1364 + i * 2;
    const label = 1465 + i * 2;
    const value = 1466 + i * 2;
    items.push(
      `<P${mode}>11</P${mode}>`,
      `<P${account}>0</P${account}>`,
      `<P${label}>${xmlText(p.name) || p.number}</P${label}>`,
      `<P${value}>${xmlText(p.number)}</P${value}>`,
    );
  });
  return [
    `<?xml version="1.0" encoding="UTF-8" ?>`,
    `<gs_provision version="1">`,
    `<config version="1">`,
    ...items,
    `</config>`,
    `</gs_provision>`,
  ].join("\n");
}

export function deskPhoneConfig(input: {
  profile: string;
  number: string;
  name: string;
  password: string;
  host: string;
  peers: ProvisionPeer[];
}): { body: string; contentType: string } {
  const self = { number: input.number, name: input.name, password: input.password };
  const peers = blfPeers(input.number, input.peers);
  const profile = input.profile.toLowerCase();
  if (profile === "fanvil") {
    return { body: fanvil(self, input.host, peers), contentType: "text/plain; charset=utf-8" };
  }
  if (profile === "grandstream") {
    return { body: grandstream(self, input.host, peers), contentType: "text/xml; charset=utf-8" };
  }
  return { body: yealink(self, input.host, peers), contentType: "text/plain; charset=utf-8" };
}
