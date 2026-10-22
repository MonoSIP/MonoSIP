import { describe, expect, it } from "vitest";
import { callIdFromMailbox, mailboxKey, mailboxOwner, usableCaller } from "./voicemail-inbox.js";

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

describe("mailbox identity", () => {
  it("treats the symlink path and the real path as the same recording", () => {
    expect(mailboxKey("/data/asterisk/voicemail/100-1729000.12.wav")).toBe(
      mailboxKey("/var/lib/asterisk/munasip/voicemail/100-1729000.12.WAV"),
    );
  });

  it("reads the CDR call id from the filename", () => {
    expect(callIdFromMailbox("/data/voicemail/100-1729000.12.wav")).toBe("1729000.12");
    expect(callIdFromMailbox("beep.wav")).toBeNull();
  });

  it("rejects a dash or a placeholder as a caller", () => {
    expect(usableCaller("-")).toBeNull();
    expect(usableCaller("—")).toBeNull();
    expect(usableCaller("unknown")).toBeNull();
    expect(usableCaller(" 90555 ")).toBe("90555");
  });
});
