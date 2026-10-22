import type { QueryClient } from "@tanstack/react-query";
import { api } from "./api";

type MissedRow = { id?: string; status: string; seen?: boolean };

/** Ids the user has already looked at. A later refetch must not light the badge again. */
const acked = new Set<string>();
let hooked = false;

function patch(rows: MissedRow[]): MissedRow[] {
  return rows.map((row) => (row.id && acked.has(row.id) ? { ...row, seen: true } : row));
}

function ensureHook(qc: QueryClient) {
  if (hooked) return;
  hooked = true;
  qc.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.query.queryKey[0] !== "my-missed") return;
    const data = event.query.state.data;
    if (!Array.isArray(data)) return;
    if (!data.some((row: MissedRow) => row.id && acked.has(row.id) && !row.seen)) return;
    qc.setQueryData<MissedRow[]>(["my-missed"], (prev) => patch(Array.isArray(prev) ? prev : []));
  });
}

/**
 * Opening the missed list clears the phone-menu count immediately.
 * Waiting for the POST and dropping the cache write when the page unmounts
 * left the badge up: a tap on a missed row opens the phone before the reply,
 * and the next fetch still had seen:false.
 */
export function acknowledgeMissed(qc: QueryClient) {
  ensureHook(qc);
  const current = qc.getQueryData<MissedRow[]>(["my-missed"]);
  const rows = Array.isArray(current) ? current : [];
  let added = false;
  for (const row of rows) {
    if (row.status === "pending" && !row.seen && row.id && !acked.has(row.id)) {
      acked.add(row.id);
      added = true;
    }
  }
  if (!added) return;
  void qc.cancelQueries({ queryKey: ["my-missed"] });
  qc.setQueryData<MissedRow[]>(["my-missed"], (prev) => patch(Array.isArray(prev) ? prev : []));
  void api.post("/api/v1/me/missed-calls/seen").catch(() => undefined);
}
