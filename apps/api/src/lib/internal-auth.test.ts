import { describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: {
    internalApiSecret: "s3cret-value",
    encryptionKey:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    asterisk: { ariUrl: "http://127.0.0.1:8088" }, // embedded / all-in-one
  },
}));

const { requireInternalSecret } = await import("./internal-auth.js");

function mockReqReply(opts: { secret?: string; peer?: string }) {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  const req = {
    headers: opts.secret ? { "x-monosip-internal": opts.secret } : {},
    socket: { remoteAddress: opts.peer ?? "127.0.0.1" },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { req: req as any, reply: reply as any, replyMock: reply };
}

describe("requireInternalSecret (embedded Asterisk)", () => {
  it("accepts the correct secret from loopback", () => {
    const { req, reply, replyMock } = mockReqReply({ secret: "s3cret-value", peer: "127.0.0.1" });
    expect(requireInternalSecret(req, reply)).toBe(true);
    expect(replyMock.code).not.toHaveBeenCalled();
  });

  it("accepts an IPv4-mapped loopback peer", () => {
    const { req, reply } = mockReqReply({ secret: "s3cret-value", peer: "::ffff:127.0.0.1" });
    expect(requireInternalSecret(req, reply)).toBe(true);
  });

  it("rejects a correct secret from a non-loopback peer (external)", () => {
    const { req, reply, replyMock } = mockReqReply({ secret: "s3cret-value", peer: "172.17.0.1" });
    expect(requireInternalSecret(req, reply)).toBe(false);
    expect(replyMock.code).toHaveBeenCalledWith(403);
  });

  it("rejects a wrong secret from loopback", () => {
    const { req, reply, replyMock } = mockReqReply({ secret: "wrong", peer: "127.0.0.1" });
    expect(requireInternalSecret(req, reply)).toBe(false);
    expect(replyMock.code).toHaveBeenCalledWith(401);
  });

  it("rejects a missing secret", () => {
    const { req, reply, replyMock } = mockReqReply({ peer: "127.0.0.1" });
    expect(requireInternalSecret(req, reply)).toBe(false);
    expect(replyMock.code).toHaveBeenCalledWith(401);
  });
});
