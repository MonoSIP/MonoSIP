import { describe, expect, it } from "vitest";
import { resolveExtensionNumber } from "./routing.js";

describe("resolveExtensionNumber", () => {
  const exts = [
    { id: "uuid-101", number: "101" },
    { id: "uuid-102", number: "102" },
  ];

  it("passes through short extension numbers", () => {
    expect(resolveExtensionNumber("101", exts)).toBe("101");
  });

  it("maps UUID to number", () => {
    expect(resolveExtensionNumber("uuid-102", exts)).toBe("102");
  });

  it("returns null for unknown", () => {
    expect(resolveExtensionNumber("missing", exts)).toBeNull();
    expect(resolveExtensionNumber(null, exts)).toBeNull();
  });
});
