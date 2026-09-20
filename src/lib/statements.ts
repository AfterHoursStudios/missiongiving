import { SETTLED_STATUSES } from "@/lib/donations/status";

export interface StatementDonation {
  id: string; status: string; amount_cents: number; refunded_cents: number;
  donated_at: string; settled_at: string | null; designation: string; receipt_number?: string | null;
}

/** Calendar year of an instant in the organization's time zone (a gift settling near midnight on Dec 31 must land in the right year). */
export function yearInZone(iso: string, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone }).format(new Date(iso)));
}

/** A gift counts in the year it SETTLED (ACH may settle in a later year than it was initiated). */
export function effectiveDate(d: Pick<StatementDonation, "donated_at" | "settled_at">) {
  return d.settled_at ?? d.donated_at;
}

export interface Statement {
  year: number;
  lines: (StatementDonation & { net_cents: number })[];
  totalCents: number;
}

/** Only settled donations, net of refunds. Pending/failed/disputed/canceled and zero-net lines are excluded. */
export function buildStatement(rows: StatementDonation[], year: number, timeZone: string): Statement {
  const lines = rows
    .filter((d) => (SETTLED_STATUSES as readonly string[]).includes(d.status))
    .filter((d) => yearInZone(effectiveDate(d), timeZone) === year)
    .map((d) => ({ ...d, net_cents: d.amount_cents - d.refunded_cents }))
    .filter((d) => d.net_cents > 0)
    .sort((a, b) => +new Date(effectiveDate(a)) - +new Date(effectiveDate(b)));
  return { year, lines, totalCents: lines.reduce((s, l) => s + l.net_cents, 0) };
}

/** Years that have at least one settled gift, newest first, for the year picker. */
export function statementYears(rows: StatementDonation[], timeZone: string): number[] {
  const years = new Set<number>();
  for (const d of rows)
    if ((SETTLED_STATUSES as readonly string[]).includes(d.status)) years.add(yearInZone(effectiveDate(d), timeZone));
  return [...years].sort((a, b) => b - a);
}
