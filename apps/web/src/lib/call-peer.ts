/** Other party on a CDR row relative to the logged-in extension. */
export function callPeer(
  c: { direction?: string | null; caller?: string | null; callee?: string | null },
  myNumber?: string | null,
): string {
  const caller = (c.caller ?? "").trim();
  const callee = (c.callee ?? "").trim();
  const me = (myNumber ?? "").trim();
  if (me) {
    if (caller === me && callee) return callee;
    if (callee === me && caller) return caller;
  }
  if (c.direction === "outbound") return callee || caller;
  if (c.direction === "inbound") return caller || callee;
  // internal / unknown: prefer the dialed party
  return callee || caller;
}
