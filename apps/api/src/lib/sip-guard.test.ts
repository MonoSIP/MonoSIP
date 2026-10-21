import { describe, expect, it, vi } from "vitest";
import { createSipGuard, failedAuthAddress, ipMatches, parseRemoteAddress } from "./sip-guard.js";

const fail = (ip: string, event = "InvalidAccountID") => ({
  Event: event,
  Service: "PJSIP",
  RemoteAddress: `IPV4/UDP/${ip}/5065`,
});

describe("parsing", () => {
  it("reads the address from an AMI RemoteAddress", () => {
    expect(parseRemoteAddress("IPV4/UDP/160.119.71.252/5065")).toBe("160.119.71.252");
    expect(parseRemoteAddress("IPV6/UDP/2001:db8::1/5060")).toBe("2001:db8::1");
    expect(parseRemoteAddress("garbage")).toBeNull();
    expect(parseRemoteAddress(undefined)).toBeNull();
  });

  it("only counts failed-authentication events", () => {
    expect(failedAuthAddress(fail("1.2.3.4"))).toBe("1.2.3.4");
    expect(failedAuthAddress(fail("1.2.3.4", "ChallengeResponseFailed"))).toBe("1.2.3.4");
    expect(failedAuthAddress(fail("1.2.3.4", "SuccessfulAuth"))).toBeNull();
    expect(failedAuthAddress(fail("1.2.3.4", "ChallengeSent"))).toBeNull();
  });

  it("matches CIDRs and plain addresses", () => {
    expect(ipMatches("192.168.1.20", "192.168.0.0/16")).toBe(true);
    expect(ipMatches("172.31.0.1", "172.16.0.0/12")).toBe(true);
    expect(ipMatches("172.32.0.1", "172.16.0.0/12")).toBe(false);
    expect(ipMatches("46.20.6.254", "46.20.6.254")).toBe(true);
    expect(ipMatches("46.20.6.25", "46.20.6.254")).toBe(false);
    expect(ipMatches("8.8.8.8", "0.0.0.0/0")).toBe(true);
  });
});

describe("createSipGuard", () => {
  function setup(exempt: (ip: string) => boolean = () => false) {
    let t = 1_000_000;
    const onBan = vi.fn(async () => undefined);
    const guard = createSipGuard({ threshold: 3, windowMs: 60_000, banMs: 3_600_000, isExempt: exempt, onBan, now: () => t });
    return { guard, onBan, tick: (ms: number) => (t += ms) };
  }

  it("bans an address once it reaches the threshold within the window", async () => {
    const { guard, onBan } = setup();
    expect(await guard.observe(fail("9.9.9.9"))).toBe(false);
    expect(await guard.observe(fail("9.9.9.9"))).toBe(false);
    expect(await guard.observe(fail("9.9.9.9"))).toBe(true);
    expect(onBan).toHaveBeenCalledWith("9.9.9.9", 3);
    // further attempts while banned don't ban again
    await guard.observe(fail("9.9.9.9"));
    await guard.observe(fail("9.9.9.9"));
    await guard.observe(fail("9.9.9.9"));
    expect(onBan).toHaveBeenCalledTimes(1);
  });

  it("ignores failures spread wider than the window", async () => {
    const { guard, onBan, tick } = setup();
    for (let i = 0; i < 5; i++) {
      await guard.observe(fail("9.9.9.9"));
      tick(40_000);
    }
    expect(onBan).not.toHaveBeenCalled();
  });

  it("never bans exempt addresses", async () => {
    const { guard, onBan } = setup((ip) => ip.startsWith("192.168."));
    for (let i = 0; i < 6; i++) await guard.observe(fail("192.168.1.5"));
    expect(onBan).not.toHaveBeenCalled();
  });

  it("can ban the same address again after the ban expires", async () => {
    const { guard, onBan, tick } = setup();
    for (let i = 0; i < 3; i++) await guard.observe(fail("9.9.9.9"));
    tick(3_600_001);
    guard.sweep();
    for (let i = 0; i < 3; i++) await guard.observe(fail("9.9.9.9"));
    expect(onBan).toHaveBeenCalledTimes(2);
  });
});
