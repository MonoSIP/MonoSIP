#!/usr/bin/env bash
# MonoSIP host firewall helper (nftables).
# Review and edit CIDRs before applying. Does NOT run automatically from Docker.
#
# Usage:
#   SIP_ALLOW="203.0.113.0/24,10.0.0.0/8" SSH_ALLOW="203.0.113.10" sudo ./scripts/harden-firewall.sh
#   Or paste rules from Admin → Settings → Security → Download nftables

set -euo pipefail

SIP_ALLOW="${SIP_ALLOW:-}"
SSH_ALLOW="${SSH_ALLOW:-}"
RTP_RANGE="${RTP_RANGE:-10000-10100}"
TURN_RELAY="${TURN_RELAY:-49152-49200}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

if ! command -v nft >/dev/null 2>&1; then
  echo "nftables (nft) not found. Install nftables or use the ufw export from the panel." >&2
  exit 1
fi

echo "Flushing previous inet monosip_filter table (if any)…"
nft delete table inet monosip_filter 2>/dev/null || true

SIP_RULES=""
if [[ -z "$SIP_ALLOW" ]]; then
  echo "WARNING: SIP_ALLOW empty — opening 5060 + RTP to the world (lab only)." >&2
  SIP_RULES=$'    tcp dport 5060 accept\n    udp dport 5060 accept\n    udp dport '"$RTP_RANGE"$' accept\n'
else
  IFS=',' read -ra CIDRS <<< "$SIP_ALLOW"
  for c in "${CIDRS[@]}"; do
    c="$(echo "$c" | xargs)"
    [[ -z "$c" ]] && continue
    SIP_RULES+="    ip saddr $c tcp dport 5060 accept"$'\n'
    SIP_RULES+="    ip saddr $c udp dport 5060 accept"$'\n'
    SIP_RULES+="    ip saddr $c udp dport $RTP_RANGE accept"$'\n'
  done
fi

SSH_RULES="    tcp dport 22 accept"$'\n'
if [[ -n "$SSH_ALLOW" ]]; then
  SSH_RULES=""
  IFS=',' read -ra SC <<< "$SSH_ALLOW"
  for c in "${SC[@]}"; do
    c="$(echo "$c" | xargs)"
    [[ -z "$c" ]] && continue
    SSH_RULES+="    ip saddr $c tcp dport 22 accept"$'\n'
  done
fi

nft -f - <<EOF
table inet monosip_filter {
  chain input {
    type filter hook input priority 0; policy drop;
    iif lo accept
    ct state established,related accept
    tcp dport 443 accept
    udp dport 3478 accept
    udp dport ${TURN_RELAY} accept
${SIP_RULES}${SSH_RULES}  }
}
EOF

echo "Applied inet monosip_filter. Persist with your distro (e.g. nft list ruleset > /etc/nftables.conf)."
echo "Prefer panel export for SIP CIDRs synced from Settings + trunks."
