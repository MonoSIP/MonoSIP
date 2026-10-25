/**
 * CSV cell formatting that survives spreadsheets (CWE-1236):
 * - quote cells containing separators, quotes or newlines, doubling embedded quotes
 * - prefix formula-leading characters (= + - @ tab CR) with a single quote, so
 *   attacker-influenced caller ID cannot become a live spreadsheet formula when
 *   an admin opens an export.
 */
export function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
