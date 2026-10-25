import { SettingsSchema } from "@monosip/shared";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { cdr, callEvents, settings } from "../db/schema.js";
import { sendSmtpMail } from "../lib/smtp.js";

/** Build a minimal PDF (text-only) without external libs. */
function simplePdf(lines: string[]): Buffer {
  const text = lines.map((l) => l.replace(/[()\\]/g, "")).join("\n");
  const stream = `BT /F1 11 Tf 50 750 Td 14 TL (${text.split("\n").join(") Tj T* (")}) Tj ET`;
  const objs = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n",
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const o of objs) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += o;
  }
  const xref = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function localYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Daily/monthly summary — SMTP with CSV + PDF if configured, otherwise log-only. */
export async function sendSummaryReport(kind: "daily" | "monthly" = "daily"): Promise<void> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  const s = SettingsSchema.parse(row?.data ?? {});
  const since = new Date();
  if (kind === "daily") since.setHours(0, 0, 0, 0);
  else {
    since.setDate(1);
    since.setHours(0, 0, 0, 0);
  }

  const rows = await db.select().from(cdr);
  const slice = rows.filter((c) => c.startedAt && c.startedAt >= since);
  const answered = slice.filter((c) => c.disposition === "ANSWERED").length;
  const missed = slice.filter((c) => c.disposition !== "ANSWERED").length;
  const ivr = await db.select().from(callEvents);
  const ivrHits = ivr.filter((e) => e.type === "ivr.dtmf" && e.at && e.at >= since).length;

  const subject = `MonoSIP ${kind} summary`;
  const lines = [
    `MonoSIP ${kind} summary`,
    `Period start: ${since.toISOString()}`,
    `Total CDR: ${slice.length}`,
    `Answered: ${answered}`,
    `Missed/other: ${missed}`,
    `IVR DTMF events: ${ivrHits}`,
  ];
  const body = lines.join("\n");

  const csvHeader = "callId,startedAt,direction,caller,callee,disposition,duration,billsec\n";
  const csvBody =
    csvHeader +
    slice
      .map(
        (c) =>
          `${c.callId},${c.startedAt?.toISOString() ?? ""},${c.direction},${c.caller},${c.callee},${c.disposition},${c.duration},${c.billsec}`,
      )
      .join("\n");

  if (s.smtpHost && s.smtpTo) {
    try {
      await sendSmtpMail(
        {
          host: s.smtpHost,
          port: s.smtpPort,
          user: s.smtpUser,
          password: s.smtpPassword,
          from: s.emailFrom,
          to: s.smtpTo,
        },
        subject,
        body,
        [
          {
            filename: `monosip-${kind}-${since.toISOString().slice(0, 10)}.csv`,
            contentType: "text/csv",
            buffer: Buffer.from(csvBody, "utf8"),
          },
          {
            filename: `monosip-${kind}-${since.toISOString().slice(0, 10)}.pdf`,
            contentType: "application/pdf",
            buffer: simplePdf(lines),
          },
        ],
      );
      console.log(`[report] SMTP sent to ${s.smtpTo} via ${s.smtpHost}`);
    } catch (e) {
      console.error(`[report] SMTP failed: ${(e as Error).message}\n${body}`);
    }
  } else {
    console.log(`[report] ${kind} summary (log-only, no SMTP)\n${body}`);
  }
}

function msUntilNextLocalHour(hour: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 5, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Schedule daily report around 06:05 local time; monthly on the 1st at the same tick.
 * Avoids sending on every API restart (unlike interval-from-boot).
 */
export function startSummaryEmailJob() {
  let lastDaily = "";
  let lastMonthly = "";

  const tick = () => {
    const today = localYmd();
    const day = new Date().getDate();
    if (lastDaily !== today) {
      lastDaily = today;
      void sendSummaryReport("daily").catch((e) => console.warn("[report]", (e as Error).message));
    }
    if (day === 1 && lastMonthly !== today) {
      lastMonthly = today;
      void sendSummaryReport("monthly").catch((e) => console.warn("[report]", (e as Error).message));
    }
  };

  const wait = msUntilNextLocalHour(6);
  setTimeout(() => {
    tick();
    setInterval(tick, 24 * 3600_000);
  }, wait);
  console.log(`[report] next summary in ${Math.round(wait / 60000)} min (local 06:05)`);
  return {};
}
