import { config } from "../config.js";
import { resolveExternalIpDetailed } from "./external-ip.js";
import { isPrivateOrLocalIpv4 } from "./stun-discover.js";

export type MediaReadiness = {
  /** Softphone SIP/WSS can work; RTP may still need host UDP. */
  signalingOk: boolean;
  /**
   * True only when operator opted in (`MONOSIP_RTP_PUBLISHED=1`) or local lab
   * (no public host). Otherwise softphone audio needs host UDP 10000–10100.
   */
  rtpPortsPublished: boolean;
  externalIp: string | null;
  externalIpSource?: string;
  rtpUdpRange: string;
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
    process.env.MONOSIP_RTP_PUBLISHED === "1" || process.env.MONOSIP_RTP_PUBLISHED === "true"
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
    externalIp,
    externalIpSource: resolved.source,
    rtpUdpRange: "10000-10100",
    warnings,
  };
}

/** Loud banner for NineDeploy / docker logs at boot (English). */
export function formatMediaDeployBanner(m: MediaReadiness): string {
  if (!m.warnings.length) {
    return "[MonoSIP] Softphone media: OK (RTP ports marked published or local lab).";
  }
  const lines = [
    "",
    "╔══════════════════════════════════════════════════════════════════════╗",
    "║  MonoSIP — Softphone AUDIO needs host UDP ports                         ║",
    "╠══════════════════════════════════════════════════════════════════════╣",
    "║  Publish UDP 10000-10100 to this container                            ║",
    "║  Env: EXTERNAL_IP=<server public IPv4>                               ║",
    "║       MONOSIP_RTP_PUBLISHED=1   (after ports are open)                  ║",
    "║  Without this: calls connect but stay SILENT.                        ║",
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
