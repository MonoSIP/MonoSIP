import net from "node:net";
import tls from "node:tls";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type SmtpConfig = {
  host: string;
  port?: number | null;
  user?: string | null;
  password?: string | null;
  from?: string | null;
  to: string;
};

export type SmtpAttachment = {
  filename: string;
  contentType?: string;
  /** Absolute path or raw Buffer */
  path?: string;
  buffer?: Buffer;
};

/** Minimal SMTP client (AUTH LOGIN + STARTTLS when port 587). Supports optional attachments. */
export async function sendSmtpMail(
  cfg: SmtpConfig,
  subject: string,
  body: string,
  attachments: SmtpAttachment[] = [],
): Promise<void> {
  const port = cfg.port || 587;
  const from = cfg.from || cfg.user || "munasip@localhost";
  const useStartTls = port === 587 || port === 25;

  const loaded: Array<{ filename: string; contentType: string; data: Buffer }> = [];
  for (const a of attachments) {
    let data = a.buffer;
    if (!data && a.path) data = await readFile(a.path);
    if (!data) continue;
    loaded.push({
      filename: a.filename || path.basename(a.path ?? "attach.bin"),
      contentType: a.contentType ?? "application/octet-stream",
      data,
    });
  }

  await new Promise<void>((resolve, reject) => {
    const sock = net.connect({ host: cfg.host, port }, () => {
      void run().catch(reject);
    });
    sock.setEncoding("utf8");
    sock.on("error", reject);

    let buf = "";
    let secure: net.Socket | tls.TLSSocket = sock;

    function write(line: string) {
      secure.write(line + "\r\n");
    }

    function readCode(): Promise<{ code: number; text: string }> {
      return new Promise((res, rej) => {
        const onData = (chunk: string) => {
          buf += chunk;
          const lines = buf.split(/\r?\n/);
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const m = /^(\d{3})[ -]/.exec(line);
            if (m && !line.startsWith(`${m[1]}-`)) {
              secure.off("data", onData);
              res({ code: Number(m[1]), text: line });
              return;
            }
          }
        };
        secure.on("data", onData);
        setTimeout(() => {
          secure.off("data", onData);
          rej(new Error("SMTP timeout"));
        }, 20_000);
      });
    }

    async function expect(ok: number | number[]) {
      const allowed = Array.isArray(ok) ? ok : [ok];
      const r = await readCode();
      if (!allowed.includes(r.code)) throw new Error(`SMTP ${r.text}`);
      return r;
    }

    async function run() {
      await expect(220);
      write(`EHLO munasip`);
      await expect(250);

      if (useStartTls) {
        write("STARTTLS");
        await expect(220);
        secure = tls.connect({ socket: sock, servername: cfg.host, rejectUnauthorized: false });
        secure.setEncoding("utf8");
        await new Promise<void>((r, j) => {
          (secure as tls.TLSSocket).once("secureConnect", () => r());
          secure.once("error", j);
        });
        write(`EHLO munasip`);
        await expect(250);
      }

      if (cfg.user && cfg.password) {
        write("AUTH LOGIN");
        await expect(334);
        write(Buffer.from(cfg.user).toString("base64"));
        await expect(334);
        write(Buffer.from(cfg.password).toString("base64"));
        await expect(235);
      }

      write(`MAIL FROM:<${from}>`);
      await expect(250);
      for (const addr of cfg.to.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
        write(`RCPT TO:<${addr}>`);
        await expect([250, 251]);
      }
      write("DATA");
      await expect(354);

      const boundary = `munasip_${Date.now().toString(36)}`;
      const headers = [
        `From: ${from}`,
        `To: ${cfg.to}`,
        `Subject: ${subject}`,
        "MIME-Version: 1.0",
      ];

      let payload: string;
      if (loaded.length === 0) {
        payload = [
          ...headers,
          "Content-Type: text/plain; charset=utf-8",
          "",
          body.replace(/^\./gm, ".."),
          ".",
        ].join("\r\n");
      } else {
        const chunks: string[] = [
          ...headers,
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          "",
          `--${boundary}`,
          "Content-Type: text/plain; charset=utf-8",
          "",
          body.replace(/^\./gm, ".."),
        ];
        for (const a of loaded) {
          chunks.push(
            `--${boundary}`,
            `Content-Type: ${a.contentType}; name="${a.filename}"`,
            "Content-Transfer-Encoding: base64",
            `Content-Disposition: attachment; filename="${a.filename}"`,
            "",
            a.data.toString("base64").replace(/.{76}/g, (m) => m + "\r\n").trim(),
          );
        }
        chunks.push(`--${boundary}--`, ".");
        payload = chunks.join("\r\n");
      }

      secure.write(payload + "\r\n");
      await expect(250);
      write("QUIT");
      secure.end();
      resolve();
    }
  });
}
