import { lookup as dnsLookup } from "node:dns/promises";
import { config } from "../config.js";

export type MediaReadiness = {
  /** Softphone SIP/WSS can work; RTP may still need host UDP. */
  signalingOk: boolean;
  /**
   * True only when operator opted in (`DSIP_RTP_PUBLISHED=1`) or local lab
   * (no public host). Otherwise softphone audio needs host UDP 10000–10100.
   */
  rtpPortsPublished: boolean;
  externalIp: string | null;
  rtpUdpRange: string;
  /** Human hints for deploy logs + portal banner (en + tr). */
  warnings: Array<{ code: string; en: string; tr: string }>;
};

async function resolveExternalIp(): Promise<string | null> {
  if (config.externalIp) return config.externalIp;
  const host = (config.publicHost || "").trim();
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  try {
    const r = await dnsLookup(host, { family: 4 });
    return r.address || null;
  } catch {
    return null;
  }
}

/** Softphone media readiness for health + portal (NineDeploy RTP ports). */
export async function getMediaReadiness(): Promise<MediaReadiness> {
  const embedded =
    !process.env.ASTERISK_ARI_URL ||
    /127\.0\.0\.1|localhost/.test(process.env.ASTERISK_ARI_URL);
  const publicHost = (config.publicHost || "").trim();
  const isPublic =
    !!publicHost && publicHost !== "localhost" && publicHost !== "127.0.0.1";
  const rtpPortsPublished =
    process.env.DSIP_RTP_PUBLISHED === "1" || process.env.DSIP_RTP_PUBLISHED === "true"
      ? true
      : !embedded || !isPublic;

  const externalIp = await resolveExternalIp();
  const warnings: MediaReadiness["warnings"] = [];

  if (embedded && isPublic && !rtpPortsPublished) {
    warnings.push({
      code: "rtp_udp_ports",
      en: "Softphone audio needs host UDP ports 10000–10100 published to this container. Add UDP 10000-10100, then set env DSIP_RTP_PUBLISHED=1.",
      tr: "Softphone audio needs host UDP ports 10000–10100 published to this container. Add UDP 10000-10100, then set env DSIP_RTP_PUBLISHED=1.",
    });
  }
  if (isPublic && !externalIp) {
    warnings.push({
      code: "external_ip",
      en: "Set EXTERNAL_IP to this server’s public IPv4 (or PUBLIC_HOST so it can be resolved) so WebRTC ICE can send media.",
      tr: "WebRTC sesi için EXTERNAL_IP olarak sunucunun genel IPv4 adresini yazın (veya çözümlenebilir PUBLIC_HOST kullanın).",
    });
  }

  return {
    signalingOk: true,
    rtpPortsPublished,
    externalIp,
    rtpUdpRange: "10000-10100",
    warnings,
  };
}

/** Loud banner for NineDeploy / docker logs at boot (English). */
export function formatMediaDeployBanner(m: MediaReadiness): string {
  if (!m.warnings.length) {
    return "[DSip] Softphone media: OK (RTP ports marked published or local lab).";
  }
  const lines = [
    "",
    "╔══════════════════════════════════════════════════════════════════════╗",
    "║  DSip — Softphone AUDIO needs host UDP ports                         ║",
    "╠══════════════════════════════════════════════════════════════════════╣",
    "║  Publish UDP 10000-10100 to this container                            ║",
    "║  Env: EXTERNAL_IP=<server public IPv4>                               ║",
    "║       DSIP_RTP_PUBLISHED=1   (after ports are open)                  ║",
    "║  Without this: calls connect but stay SILENT.                        ║",
    "╚══════════════════════════════════════════════════════════════════════╝",
    "",
  ];
  for (const w of m.warnings) {
    lines.push(`[DSip] WARN ${w.code}: ${w.en}`);
  }
  if (m.externalIp) lines.push(`[DSip] EXTERNAL_IP effective: ${m.externalIp}`);
  lines.push("");
  return lines.join("\n");
}
