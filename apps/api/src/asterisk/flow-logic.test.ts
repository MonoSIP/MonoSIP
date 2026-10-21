import { describe, expect, it } from "vitest";
import type { FlowJson } from "@munasip/shared";
import {
  numberToTurkishWords,
  compare,
  conditionLeft,
  decodeCallbackPlace,
  dialStatusToHandle,
  encodeCallbackPlace,
  expandTemplate,
  jsonPath,
  matchDirectoryExtension,
  menuHasExit,
  nameToKeypad,
  nextNode,
  resolveMenuDigit,
  shouldDialQueueCallback,
} from "./flow-logic.js";

const menuFlow: FlowJson = {
  nodes: [
    { id: "s", type: "start", position: { x: 0, y: 0 }, data: {} },
    { id: "m", type: "menu", position: { x: 0, y: 0 }, data: { prompt: "press" } },
    { id: "t1", type: "transfer", position: { x: 0, y: 0 }, data: { destType: "extension", destId: "101" } },
    { id: "to", type: "hangup", position: { x: 0, y: 0 }, data: {} },
    { id: "inv", type: "hangup", position: { x: 0, y: 0 }, data: {} },
  ],
  edges: [
    { id: "e0", source: "s", target: "m" },
    { id: "e1", source: "m", target: "t1", sourceHandle: "1" },
    { id: "e2", source: "m", target: "t1", sourceHandle: "2" },
    { id: "et", source: "m", target: "to", sourceHandle: "timeout" },
    { id: "ei", source: "m", target: "inv", sourceHandle: "invalid" },
  ],
};

describe("expandTemplate", () => {
  it("replaces {{vars}} and leaves missing empty", () => {
    expect(expandTemplate("hi {{caller}} / {{x}}", { caller: "0555" })).toBe("hi 0555 / ");
  });

  it("replaces $name style placeholders", () => {
    expect(expandTemplate("PIN=$pin agent=$agent", { pin: "1234", agent: "101" })).toBe(
      "PIN=1234 agent=101",
    );
    expect(expandTemplate("mix {{caller}} and $pin", { caller: "9", pin: "1" })).toBe(
      "mix 9 and 1",
    );
  });
});

describe("compare", () => {
  it("equality and inequality", () => {
    expect(compare("a", "a", "=")).toBe(true);
    expect(compare("a", "b", "!=")).toBe(true);
  });

  it("numeric ops", () => {
    expect(compare("10", "5", ">")).toBe(true);
    expect(compare("3", "3", ">=")).toBe(true);
    expect(compare("2", "3", "<=")).toBe(true);
  });

  it("string helpers", () => {
    expect(compare("hello", "ell", "contains")).toBe(true);
    expect(compare("hello", "he", "starts_with")).toBe(true);
    expect(compare("hello", "lo", "ends_with")).toBe(true);
    expect(compare("", "", "empty")).toBe(true);
    expect(compare("abc", "^a", "regex")).toBe(true);
  });

  it("area_code strips TR country / leading 0", () => {
    expect(compare("02121234567", "212", "area_code")).toBe(true);
    expect(compare("905321112233", "532", "area_code")).toBe(true);
    expect(compare("5321112233", "212", "area_code")).toBe(false);
  });

  it("country_code accepts TR labels and domestic 0", () => {
    expect(compare("+905321112233", "TR", "country_code")).toBe(true);
    expect(compare("05321112233", "90", "country_code")).toBe(true);
    expect(compare("+12025550100", "US", "country_code")).toBe(true);
  });
});

describe("conditionLeft", () => {
  it("defaults area/country to caller when variable empty", () => {
    expect(conditionLeft({ caller: "0532" }, "", "area_code")).toBe("0532");
    expect(conditionLeft({ did: "212" }, "x", "country_code")).toBe("212");
    expect(conditionLeft({ x: "9", caller: "1" }, "x", "=")).toBe("9");
  });
});

describe("nextNode / menuHasExit", () => {
  it("resolves strict menu digit", () => {
    expect(nextNode(menuFlow, "m", "1", true)?.id).toBe("t1");
    expect(nextNode(menuFlow, "m", "9", true)).toBeUndefined();
    expect(menuHasExit(menuFlow, "m", "invalid")).toBe(true);
  });

  it("non-strict falls back to first edge", () => {
    expect(nextNode(menuFlow, "s")?.id).toBe("m");
  });
});

describe("resolveMenuDigit", () => {
  it("takes valid digit", () => {
    expect(resolveMenuDigit({ flow: menuFlow, nodeId: "m", digits: ["1"], startIdx: 0 })).toEqual({
      handle: "1",
      nextIdx: 1,
    });
  });

  it("retries then invalid", () => {
    const r = resolveMenuDigit({
      flow: menuFlow,
      nodeId: "m",
      digits: ["9", "8", "7"],
      startIdx: 0,
      retries: 2,
    });
    expect(r.handle).toBe("invalid");
    expect(r.nextIdx).toBe(3);
  });

  it("timeout when sequence exhausted", () => {
    expect(
      resolveMenuDigit({ flow: menuFlow, nodeId: "m", digits: [], startIdx: 0 }).handle,
    ).toBe("timeout");
  });

  it("accepts digit after one invalid retry", () => {
    const r = resolveMenuDigit({
      flow: menuFlow,
      nodeId: "m",
      digits: ["9", "2"],
      startIdx: 0,
      retries: 2,
    });
    expect(r).toEqual({ handle: "2", nextIdx: 2 });
  });
});

describe("directory keypad", () => {
  it("maps Turkish names", () => {
    expect(nameToKeypad("Yılmaz")).toBe("945629");
  });

  it("matches surname digits", () => {
    const hit = matchDirectoryExtension(
      [
        { number: "101", name: "Ali Yılmaz" },
        { number: "102", name: "Ayşe Demir" },
      ],
      "945",
    );
    expect(hit?.number).toBe("101");
  });
});

describe("dialStatusToHandle / jsonPath", () => {
  it("maps dial status", () => {
    expect(dialStatusToHandle("BUSY")).toBe("busy");
    expect(dialStatusToHandle("CHANUNAVAIL")).toBe("chanunavail");
    expect(dialStatusToHandle("NOANSWER")).toBe("noanswer");
  });

  it("reads nested paths", () => {
    expect(jsonPath({ a: { b: 1 } }, "$.a.b")).toBe(1);
    expect(jsonPath({ a: 1 }, "$.missing")).toBeUndefined();
  });
});

describe("queue callback place helpers", () => {
  it("encodes and decodes place", () => {
    expect(encodeCallbackPlace(3)).toBe("place:3");
    expect(decodeCallbackPlace("place:3")).toBe(3);
    expect(decodeCallbackPlace("chan-xyz")).toBeNull();
  });

  it("shouldDialQueueCallback respects place", () => {
    expect(shouldDialQueueCallback(0, 5)).toBe(true);
    expect(shouldDialQueueCallback(2, 3)).toBe(true);
    expect(shouldDialQueueCallback(3, 3)).toBe(false);
    expect(shouldDialQueueCallback(1, null)).toBe(false);
  });
});

describe("expandTemplate filters", () => {
  it("maps a plate code to the province name", () => {
    expect(expandTemplate("{{p|il}}", { p: "06" })).toBe("Ankara");
    expect(expandTemplate("{{p|il}}", { p: "34" })).toBe("İstanbul");
    expect(expandTemplate("{{p|il}}", { p: "63" })).toBe("Şanlıurfa");
    expect(expandTemplate("{{p|il}}", { p: "81" })).toBe("Düzce");
    expect(expandTemplate("x{{p|il}}x", { p: "82" })).toBe("xx");
    expect(expandTemplate("{{p|il}}", { p: "" })).toBe("");
  });

  it("formats phone digits, integers and Turkish money", () => {
    expect(expandTemplate("{{t|rakam}}", { t: "0312 844 06" })).toBe("0 3 1 2 8 4 4 0 6");
    expect(expandTemplate("{{d|tamsayi}}", { d: "15.72" })).toBe("16");
    expect(expandTemplate("{{c|tl}}", { c: "49.578" })).toBe("kırk dokuz virgül elli sekiz");
    expect(expandTemplate("{{g|tl}}", { g: "6566.77" })).toBe("altı bin beş yüz altmış altı virgül yetmiş yedi");
    expect(expandTemplate("{{g|tl}}", { g: "6566,7" })).toBe("altı bin beş yüz altmış altı virgül yetmiş");
    expect(expandTemplate("{{d|tl}}", { d: "-1.25" })).toBe("eksi bir virgül yirmi beş");
    expect(expandTemplate("{{d|tl}}", { d: "34.05" })).toBe("otuz dört virgül sıfır beş");
    expect(expandTemplate("{{d|tl}}", { d: "-0.001" })).toBe("sıfır");
    expect(expandTemplate("{{d|tl}}", { d: "42" })).toBe("kırk iki");
    expect(expandTemplate("{{g|tl}}", { g: "-" })).toBe("-");
    expect(expandTemplate("{{c|ascii}}", { c: "İzmir" })).toBe("izmir");
    expect(expandTemplate("{{c|ascii}}", { c: "Şanlıurfa" })).toBe("sanliurfa");
    expect(expandTemplate("{{c|ascii}}", { c: "Iğdır" })).toBe("igdir");
    expect(expandTemplate("{{c|ascii}}", { c: "Çanakkale" })).toBe("canakkale");
  });

  it("keeps plain {{var}} and $var, and ignores unknown filters", () => {
    expect(expandTemplate("{{a}} $b {{a|nope}}", { a: "1", b: "2" })).toBe("1 2 1");
  });
});

describe("numberToTurkishWords", () => {
  it("reads Turkish numbers", () => {
    expect(numberToTurkishWords(0)).toBe("sıfır");
    expect(numberToTurkishWords(100)).toBe("yüz");
    expect(numberToTurkishWords(1000)).toBe("bin");
    expect(numberToTurkishWords(1001)).toBe("bin bir");
    expect(numberToTurkishWords(10810)).toBe("on bin sekiz yüz on");
    expect(numberToTurkishWords(101000)).toBe("yüz bir bin");
    expect(numberToTurkishWords(2_500_000)).toBe("iki milyon beş yüz bin");
    expect(numberToTurkishWords(1_000_000)).toBe("bir milyon");
  });
});

describe("template filter English aliases", () => {
  it("province / digits / round / amount behave like il / rakam / tamsayi / tl", () => {
    const v = { p: "6", t: "0312 844", n: "15.72", a: "49.578" };
    expect(expandTemplate("{{p|province}}", v)).toBe(expandTemplate("{{p|il}}", v));
    expect(expandTemplate("{{t|digits}}", v)).toBe("0 3 1 2 8 4 4");
    expect(expandTemplate("{{n|round}}", v)).toBe("16");
    expect(expandTemplate("{{a|amount}}", v)).toBe(expandTemplate("{{a|tl}}", v));
  });
});
