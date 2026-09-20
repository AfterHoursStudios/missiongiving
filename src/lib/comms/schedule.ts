/**
 * Converts a wall-clock time typed in an <input type="datetime-local"> ("2026-07-01T09:30") in the ORGANIZATION's
 * time zone to a UTC instant. Avoids the server's own zone (UTC on Vercel) silently shifting scheduled sends.
 */
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (t: number) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t));
    const g = (k: string) => Number(parts.find((p) => p.type === k)!.value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - t;
  };
  // Two passes handle daylight-saving transitions.
  let t = asUtc - offsetAt(asUtc);
  t = asUtc - offsetAt(t);
  const date = new Date(t);
  return Number.isNaN(date.getTime()) ? null : date;
}
