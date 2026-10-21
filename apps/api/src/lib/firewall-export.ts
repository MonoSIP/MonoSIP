import type { Settings } from "@munasip/shared";
import { config } from "../config.js";

function lines(list: string[]): string[] {
  return list.map((s) => s.trim()).filter(Boolean);
}

/** Generate nftables-oriented snippet for host harden-firewall.sh / ops. */
export function buildFirewallExport(opts: {
  settings: Settings;
  trunkHosts: string[];
}): { nftables: string; ufw: string; meta: Record<string, unknown> } {
  const localNets = [...config.localNets];
  const sipAllow = [
    ...new Set([
      ...lines(opts.settings.sipIpAllowlist ?? []),
      ...lines(opts.settings.adminIpAllowlist ?? []),
      ...localNets,
      ...opts.trunkHosts,
    ]),
  ];
  const sipDeny = lines(opts.settings.sipIpDenylist ?? []);
  const adminAllow = lines(opts.settings.adminIpAllowlist ?? []);

  const nftSip =
    sipAllow.length === 0
      ? "  # WARNING: sipIpAllowlist empty — SIP open to world (lab only)\n  tcp dport 5060 accept\n  udp dport 5060 accept\n  udp dport 10000-10100 accept\n"
      : sipAllow
          .map(
            (cidr) =>
              `  ip saddr ${cidr} tcp dport 5060 accept\n  ip saddr ${cidr} udp dport 5060 accept\n  ip saddr ${cidr} udp dport 10000-10100 accept`,
          )
          .join("\n") + "\n";

  const nftDeny = sipDeny
    .map((cidr) => `  ip saddr ${cidr} drop comment "munasip-sip-deny"`)
    .join("\n");

  const nftables = `# MunaSIP firewall export — review before apply
# Generated ${new Date().toISOString()}
table inet munasip_filter {
  chain input {
    type filter hook input priority 0; policy drop;
    iif lo accept
    ct state established,related accept
    tcp dport 443 accept
    udp dport 3478 accept
    # TURN relay — adjust to your coturn range
    udp dport 49152-49200 accept
${nftDeny ? nftDeny + "\n" : ""}${nftSip}    # SSH — tighten to admin allowlist in production
    tcp dport 22 accept
  }
}
`;

  const ufwSip =
    sipAllow.length === 0
      ? "ufw allow 5060/udp\nufw allow 5060/tcp\nufw allow 10000:10100/udp\n"
      : sipAllow
          .map(
            (cidr) =>
              `ufw allow from ${cidr} to any port 5060 proto udp\nufw allow from ${cidr} to any port 5060 proto tcp\nufw allow from ${cidr} to any port 10000:10100 proto udp`,
          )
          .join("\n") + "\n";

  const ufw = `# MunaSIP ufw export — review before apply
ufw default deny incoming
ufw default allow outgoing
ufw allow 443/tcp
ufw allow 3478/udp
${sipDeny.map((c) => `ufw deny from ${c}`).join("\n")}${sipDeny.length ? "\n" : ""}${ufwSip}ufw allow 22/tcp
# ufw --force enable
`;

  return {
    nftables,
    ufw,
    meta: {
      sipAllow,
      sipDeny,
      adminAllow,
      localNets,
      trunkHosts: opts.trunkHosts,
      generatedAt: new Date().toISOString(),
    },
  };
}
