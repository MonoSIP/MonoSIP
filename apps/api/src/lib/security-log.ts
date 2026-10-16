import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const logPath = process.env.SECURITY_LOG_PATH ?? "/data/logs/api-security.log";

/** Append a line fail2ban can match (dsip-admin filter). */
export async function securityLog(line: string): Promise<void> {
  try {
    await mkdir(path.dirname(logPath), { recursive: true });
    const ts = new Date().toISOString();
    await appendFile(logPath, `${ts} ${line}\n`, "utf8");
  } catch (e) {
    console.warn("[security-log]", (e as Error).message);
  }
}
