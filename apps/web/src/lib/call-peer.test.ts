import { describe, expect, it } from "vitest";
import { callPeer } from "./call-peer";

describe("callPeer", () => {
  it("shows callee for outbound", () => {
    expect(callPeer({ direction: "outbound", caller: "101", callee: "05551234567" }, "101")).toBe(
      "05551234567",
    );
  });

  it("shows caller for inbound", () => {
    expect(callPeer({ direction: "inbound", caller: "05559876543", callee: "101" }, "101")).toBe(
      "05559876543",
    );
  });

  it("shows the other party for internal (not self)", () => {
    expect(callPeer({ direction: "internal", caller: "101", callee: "102" }, "101")).toBe("102");
    expect(callPeer({ direction: "internal", caller: "101", callee: "102" }, "102")).toBe("101");
  });
});
