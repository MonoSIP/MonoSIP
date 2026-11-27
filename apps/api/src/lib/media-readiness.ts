import { config } from "../config.js";
import { resolveExternalIpDetailed } from "./external-ip.js";
import { isPrivateOrLocalIpv4 } from "./stun-discover.js";

/** Keep in sync with `TRUNK_SIP_PORT` in asterisk/config-writer.ts. */
const TRUNK_SIP_PORT = 5070;

function envFlag(name: string): boolean {
  const v = process.env[name];
  return v === "1" || v === "true";
}

export type MediaReadiness = {
  /** Softphone SIP/WSS can work; RTP may still need host UDP. */
  signalingOk: boolean;
  /**
   * True only when operator opted in (`MONOSIP_RTP_PUBLISHED=1`) or local lab
   * (no public host). Otherwise softphone audio needs host UDP 10000–10100.
   */
  rtpPortsPublished: boolean;
  /**
   * Provider REGISTER Contact advertises UDP `TRUNK_SIP_PORT` (5070). Without
   * that host publish, inbound INVITEs hit the host and never reach Asterisk.
   */
  trunkSipPublished: boolean;
  externalIp: string | null;
  externalIpSource?: string;
  rtpUdpRange: string;
  trunkSipPort: number;
  /** Human hints for deploy logs + portal banner (en + tr). */
  warnings: Array<{ code: string; en: string; tr: string }>;
};

/** Softphone media readiness for health + portal (NineDeploy RTP ports). */
export async function getMediaReadiness(): Promise<MediaReadiness> {
  const embedded =
    !process.env.ASTERISK_ARI_URL ||
    /127\.0\.0\.1|localhost/.test(process.env.ASTERISK_ARI_URL);
  const publicHost = (config.publicHost || "").trim();
  const isPublic =
    !!publicHost && publicHost !== "localhost" && publicHost !== "127.0.0.1";
  const rtpPortsPublished =
    envFlag("MONOSIP_RTP_PUBLISHED") || envFlag("DSIP_RTP_PUBLISHED")
      ? true
      : !embedded || !isPublic;
  // Default assume published on non-embedded / lab; public all-in-one must opt in.
  const trunkSipPublished =
    envFlag("MONOSIP_TRUNK_SIP_PUBLISHED") || envFlag("DSIP_TRUNK_SIP_PUBLISHED")
      ? true
      : !embedded || !isPublic;

  const resolved = await resolveExternalIpDetailed();
  const externalIp = resolved.ip || null;
  const warnings: MediaReadiness["warnings"] = [];

  if (embedded && isPublic && !rtpPortsPublished) {
    warnings.push({
      code: "rtp_udp_ports",
      en: "Softphone audio needs host UDP ports 10000–10100 published to this container. Add UDP 10000-10100, then set env MONOSIP_RTP_PUBLISHED=1.",
      tr: "Softphone audio needs host UDP ports 10000–10100 published to this container. Add UDP 10000-10100, then set env MONOSIP_RTP_PUBLISHED=1.",
    });
  }
  if (embedded && isPublic && !trunkSipPublished) {
    warnings.push({
      code: "trunk_sip_port",
      en: `SIP provider inbound needs host UDP ${TRUNK_SIP_PORT} published to this container (transport-trunk Contact). Add UDP ${TRUNK_SIP_PORT}, then set env MONOSIP_TRUNK_SIP_PUBLISHED=1.`,
      tr: `Santral gelen aramaları için host UDP ${TRUNK_SIP_PORT} bu konteynere publish edilmeli. UDP ${TRUNK_SIP_PORT} ekleyip MONOSIP_TRUNK_SIP_PUBLISHED=1 verin.`,
    });
  }
  if (isPublic && (!externalIp || isPrivateOrLocalIpv4(externalIp))) {
    warnings.push({
      code: "external_ip",
      en: "No public IPv4 yet. Enable STUN in Settings (or set EXTERNAL_IP / PUBLIC_HOST) so SIP and WebRTC advertise a reachable address.",
      tr: "Genel IPv4 yok. SIP/WebRTC için Settings’te STUN’u açın veya EXTERNAL_IP / PUBLIC_HOST ayarlayın.",
    });
  }

  return {
    signalingOk: true,
    rtpPortsPublished,
    trunkSipPublished,
    externalIp,
    externalIpSource: resolved.source,
    rtpUdpRange: "10000-10100",
    trunkSipPort: TRUNK_SIP_PORT,
    warnings,
  };
}

/** Loud banner for NineDeploy / docker logs at boot (English). */
export function formatMediaDeployBanner(m: MediaReadiness): string {
  if (!m.warnings.length) {
    return "[MonoSIP] Softphone media: OK (RTP + trunk SIP ports marked published or local lab).";
  }
  const lines = [
    "",
    "╔══════════════════════════════════════════════════════════════════════╗",
    "║  MonoSIP — host UDP ports required for media / provider inbound         ║",
    "╠══════════════════════════════════════════════════════════════════════╣",
    "║  Publish UDP 10000-10100 (softphone RTP)                              ║",
    `║  Publish UDP ${String(m.trunkSipPort).padEnd(5)} (SIP provider / Verimor inbound)              ║`,
    "║  Env: EXTERNAL_IP=<server public IPv4>                               ║",
    "║       MONOSIP_RTP_PUBLISHED=1                                         ║",
    "║       MONOSIP_TRUNK_SIP_PUBLISHED=1                                   ║",
    "╚══════════════════════════════════════════════════════════════════════╝",
    "",
  ];
  for (const w of m.warnings) {
    lines.push(`[MonoSIP] WARN ${w.code}: ${w.en}`);
  }
  if (m.externalIp) lines.push(`[MonoSIP] EXTERNAL_IP effective: ${m.externalIp}`);
  lines.push("");
  return lines.join("\n");
}
