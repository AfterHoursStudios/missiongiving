/**
 * CSV serialization with spreadsheet formula-injection protection: a cell that starts with = + - @ (or tab/CR)
 * would be executed as a formula by Excel/Sheets, so it is prefixed with an apostrophe. Donor-entered text
 * (names, notes) flows into exports, so this matters.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: unknown[][]): string {
  return [columns, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
