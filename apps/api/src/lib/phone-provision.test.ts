import { describe, expect, it } from "vitest";
import { deskPhoneConfig } from "./phone-provision.js";

const peers = [
  { number: "100", name: "Ada" },
  { number: "101", name: "Bea" },
  { number: "102", name: "Cem" },
  { number: "103", name: "Deniz" },
  { number: "104", name: "Eda" },
  { number: "105", name: "Fer" },
  { number: "106", name: "Gul" },
  { number: "107", name: "Han" },
  { number: "108", name: "Ilk" },
  { number: "109", name: "Jan" },
];

describe("desk phone BLF provisioning", () => {
  it("gives Yealink a BLF key and a directed pickup code", () => {
    const { body, contentType } = deskPhoneConfig({
      profile: "yealink",
      number: "100",
      name: "Ada",
      password: "s3cret",
      host: "sip.example",
      peers,
    });
    expect(contentType).toContain("text/plain");
    expect(body).toContain("account.1.user_name = 100");
    expect(body).toContain("account.1.sip_server.1.port = 5061");
    expect(body).toContain("static.security.trust_certificates = 0");
    expect(body).toContain("static.security.cn_validation = 0");
    expect(body).toContain("linekey.1.type = 16");
    expect(body).toContain("linekey.1.value = 101");
    expect(body).toContain("linekey.1.extension = *8101");
    expect(body).toContain("linekey.1.pickup_value = *8101");
    expect(body).not.toContain("linekey.1.extension = 101");
    expect(body).not.toContain("linekey.1.value = 100");
    expect(body).toContain("linekey.8.value = 108");
    expect(body).not.toContain("linekey.9.");
  });

  it("writes Fanvil function keys the phone actually loads", () => {
    const { body } = deskPhoneConfig({
      profile: "Fanvil",
      number: "100",
      name: "Ada",
      password: "s3cret",
      host: "sip.example",
      peers,
    });
    expect(body.startsWith("<<VOIP CONFIG FILE>>")).toBe(true);
    expect(body).toContain("SIP1 Register Port :5061");
    expect(body).toContain("SIP1 Transport     :2");
    expect(body).toContain("Permission Certificate :0");
    expect(body).toContain("Common Name Validation :0");
    expect(body).toContain("Fkey1 Type         :1");
    expect(body).toContain("Fkey1 Value        :101@1/bd*8101");
    expect(body).toContain("Fkey1 Title        :Bea");
    expect(body).not.toContain("MemoryKey.");
    expect(body.trimEnd().endsWith("<<END OF FILE>>")).toBe(true);
  });

  it("writes Grandstream line-key BLF as XML", () => {
    const { body, contentType } = deskPhoneConfig({
      profile: "grandstream",
      number: "100",
      name: "A&B",
      password: "p<w>",
      host: "sip.example",
      peers: [{ number: "101", name: "Bea" }],
    });
    expect(contentType).toContain("xml");
    expect(body).toContain("<P271>1</P271>");
    expect(body).toContain("<P130>2</P130>");
    expect(body).toContain("<P183>1</P183>");
    expect(body).toContain("<P34>p&lt;w&gt;</P34>");
    expect(body).toContain("<P270>A&amp;B</P270>");
    expect(body).toContain("<P1363>11</P1363>");
    expect(body).toContain("<P1364>0</P1364>");
    expect(body).toContain("<P1466>101</P1466>");
    expect(body).toContain("<P1347>*8</P1347>");
    expect(body).toContain("<P6752>1</P6752>");
    expect(body).not.toContain("MemoryKey.");
  });
});
