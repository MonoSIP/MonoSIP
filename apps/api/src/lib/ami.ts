import net from "node:net";
import { config } from "../config.js";

/** Minimal AMI client for trunk qualify / status. */
export async function amiAction(
  action: Record<string, string>,
  timeoutMs = 4000,
): Promise<Record<string, string>[]> {
  const host = config.asterisk.amiHost;
  const port = config.asterisk.amiPort;
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port });
    let buf = "";
    const events: Record<string, string>[] = [];
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error("AMI timeout"));
    }, timeoutMs);

    sock.setEncoding("utf8");
    sock.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    sock.on("data", (chunk) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf("\r\n\r\n")) >= 0) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 4);
        const map: Record<string, string> = {};
        for (const line of block.split(/\r?\n/)) {
          const i = line.indexOf(":");
          if (i > 0) map[line.slice(0, i).trim()] = line.slice(i + 1).trim();
        }
        if (map.Response === "Success" && Object.keys(action).every((k) => k === "Action" || map[k])) {
          /* login ok */
        }
        events.push(map);
        if (map.Response === "Error") {
          clearTimeout(timer);
          sock.end();
          reject(new Error(map.Message ?? "AMI error"));
          return;
        }
        if (map.EventList === "Complete" || (map.Response === "Success" && !map.EventList && action.Action !== "PJSIPShowEndpoints")) {
          if (action.Action === "Login" || action.Action === "Ping") {
            clearTimeout(timer);
            sock.end();
            resolve(events);
            return;
          }
        }
        if (map.Event === "EndpointListComplete" || map.Event === "ContactStatusDetail") {
          /* keep reading */
        }
        if (map.EventList === "Complete") {
          clearTimeout(timer);
          sock.end();
          resolve(events);
        }
      }
    });

    sock.on("connect", () => {
      const login = [
        "Action: Login",
        `Username: ${config.asterisk.amiUser}`,
        `Secret: ${config.asterisk.amiPassword}`,
        "Events: off",
        "",
        "",
      ].join("\r\n");
      sock.write(login);
      setTimeout(() => {
        const lines = Object.entries(action).map(([k, v]) => `${k}: ${v}`);
        sock.write(lines.join("\r\n") + "\r\n\r\n");
        if (action.Action === "PJSIPShowEndpoints") {
          // wait for EventList Complete via data handler
        } else {
          setTimeout(() => {
            clearTimeout(timer);
            sock.end();
            resolve(events);
          }, 1500);
        }
      }, 200);
    });
  });
}

/** Normalize trunk status for DB varchar(32). */
export function normalizeTrunkStatus(raw: string): string {
  const s = (raw || "unknown").toLowerCase().replace(/\s+/g, "-");
  // Negatives first: substring /avail|reachable/ wrongly matches unavail/unreachable.
  if (
    s === "unavailable" ||
    s === "unreachable" ||
    s.startsWith("unavail") ||
    s.startsWith("unreach") ||
    s.includes("unavailable") ||
    s.includes("unreachable")
  ) {
    return "unreachable";
  }
  if (s.startsWith("ami-error") || s.includes("unable") || s.includes("timeout")) {
    return "unreachable";
  }
  // Idle / in-call device states stay as-is (refresh button); monitor maps them to up.
  if (s === "not-in-use" || s === "in-use" || s === "ringing" || s === "busy") {
    return s;
  }
  if (
    s === "avail" ||
    s === "available" ||
    s === "reachable" ||
    s === "registered" ||
    s === "ok" ||
    s === "success" ||
    s === "0"
  ) {
    return "registered";
  }
  return s.slice(0, 32) || "unknown";
}

/** Collapse a normalized AMI status into the panel monitor values up/down/unknown. */
export function mapTrunkMonitorStatus(normalized: string): "up" | "down" | "unknown" {
  const raw = (normalized || "unknown").toLowerCase();
  if (raw === "unreachable" || raw === "unavailable" || raw.startsWith("ami-error")) {
    return "down";
  }
  if (
    raw === "registered" ||
    raw === "not-in-use" ||
    raw === "in-use" ||
    raw === "ringing" ||
    raw === "busy" ||
    raw === "avail" ||
    raw === "available" ||
    raw === "reachable" ||
    raw === "ok" ||
    raw === "success"
  ) {
    return "up";
  }
  if (raw === "unknown") return "unknown";
  return "down";
}

export async function fetchTrunkEndpointStatus(
  endpointId: string,
): Promise<{ status: string; latencyMs: number | null }> {
  // Prefer outbound REGISTER state when the trunk registers to the provider.
  try {
    const regs = await amiAction({ Action: "PJSIPShowRegistrationsOutbound" });
    const reg = regs.find(
      (e) =>
        (e.Event === "OutboundRegistrationDetail" || e.ObjectType === "registration") &&
        (e.ObjectName === endpointId || e.OutboundAuth === `${endpointId}_auth`),
    );
    if (reg?.Status || reg?.RegistrationStatus) {
      const state = String(reg.Status ?? reg.RegistrationStatus);
      return { status: normalizeTrunkStatus(state), latencyMs: null };
    }
  } catch {
    /* fall through to endpoint/contact */
  }
  try {
    const events = await amiAction({ Action: "PJSIPShowEndpoint", Endpoint: endpointId });
    // Prefer contact Reachable/Unreachable over DeviceState (Not in use / Unavailable).
    const contact = events.find((e) => e.Event === "ContactStatusDetail");
    const endpoint = events.find((e) => e.ObjectType === "endpoint" || e.Event === "EndpointDetail");
    const state =
      contact?.Status ??
      endpoint?.DeviceState ??
      events.find((e) => e.DeviceState)?.DeviceState ??
      events.find((e) => e.Response === "Success")?.Message ??
      "unknown";
    const rtt = contact?.RoundtripUsec ? Math.round(Number(contact.RoundtripUsec) / 1000) : null;
    return { status: normalizeTrunkStatus(String(state)), latencyMs: rtt };
  } catch (e) {
    return { status: normalizeTrunkStatus(`ami-error:${(e as Error).message}`), latencyMs: null };
  }
}

/** Returns callers waiting in queue (AMI QueueStatus). */
export async function fetchQueueWaiting(queueNumber: string): Promise<number> {
  try {
    const events = await amiAction({ Action: "QueueStatus", Queue: queueNumber });
    const entry = events.find(
      (e) => e.Event === "QueueParams" || (e.Queue === queueNumber && e.Calls != null),
    );
    if (entry?.Calls != null) return Number(entry.Calls) || 0;
    return events.filter((e) => e.Event === "QueueEntry").length;
  } catch {
    return 0;
  }
}

/** Available (not paused/in-use) queue members via AMI. */
export async function fetchQueueAvailableAgents(queueNumber: string): Promise<number> {
  try {
    const events = await amiAction({ Action: "QueueStatus", Queue: queueNumber });
    return events.filter((e) => {
      if (e.Event !== "QueueMember" && e.Event !== "QueueMemberStatus") return false;
      if (e.Queue && e.Queue !== queueNumber) return false;
      const paused = String(e.Paused ?? "0") === "1";
      const status = Number(e.Status ?? e.MembershipStatus ?? 0);
      // 1 = not in use (Asterisk device state)
      return !paused && (status === 1 || status === 0);
    }).length;
  } catch {
    return 0;
  }
}
