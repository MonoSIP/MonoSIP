import { describe, expect, it } from "vitest";
import { mailboxOwner } from "./voicemail-inbox.js";

describe("mailboxOwner", () => {
  it("reads the extension from a mailbox filename", () => {
    expect(mailboxOwner("100-1729000.12.wav")).toBe("100");
    expect(mailboxOwner("1001-abc.WAV")).toBe("1001");
  });

  it("ignores files that are not a mailbox recording", () => {
    expect(mailboxOwner("beep.wav")).toBeNull();
    expect(mailboxOwner("100.wav")).toBeNull();
    expect(mailboxOwner("ext-100-1.wav")).toBeNull();
  });
});