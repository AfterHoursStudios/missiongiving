/**
 * Monthly profit & loss (statement of activities, cash-style):
 *   Revenue  = settled gifts net of refunds, by designation, in the month they settled (org timezone).
 *   Expenses = approved expenses by category (by expense date), plus payment processing fees on those gifts.
 *   Net      = revenue − expenses.
 * Pending, failed, disputed and canceled gifts and unapproved/archived expenses are excluded. Amounts are in cents.
 */
export interface PnlDonation {
  amount_cents: number; refunded_cents: number; fee_cents: number; status: string;
  settled_at: string | null; donated_at: string; project_id: string | null; project_title: string | null; fund_name: string;
}
export interface PnlExpense { expense_date: string; amount_cents: number; category_name: string; approval: string }
export interface PnlLine { label: string; monthly: number[]; current: number; prior: number; ytd: number }
export interface PnlSection { lines: PnlLine[]; total: PnlLine }
export interface Pnl { year: number; month: number; revenue: PnlSection; expenses: PnlSection; net: PnlLine }

const SETTLED = new Set(["succeeded", "partially_refunded", "refunded"]);
export const FEES_LABEL = "Payment processing fees";

/** "YYYY-MM" of an instant in the org's timezone, or of a plain date. */
export function monthKeyOf(value: string, timeZone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  return new Date(value).toLocaleDateString("en-CA", { timeZone }).slice(0, 7);
}
const key = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

export function buildPnl(input: {
  donations: PnlDonation[]; expenses: PnlExpense[]; sponsorshipProjectIds: ReadonlySet<string>;
  year: number; month: number; timeZone: string;
}): Pnl {
  const { year, month, timeZone } = input;
  const prior = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const yearKeys = Array.from({ length: 12 }, (_, i) => key(year, i + 1));
  const priorKey = key(prior.y, prior.m);
  const wanted = new Set([...yearKeys, priorKey]);

  // label → monthKey → cents
  const rev = new Map<string, Map<string, number>>(), exp = new Map<string, Map<string, number>>();
  const add = (m: Map<string, Map<string, number>>, label: string, mk: string, cents: number) => {
    if (!wanted.has(mk) || !cents) return;
    const row = m.get(label) ?? new Map<string, number>(); row.set(mk, (row.get(mk) ?? 0) + cents); m.set(label, row);
  };

  for (const d of input.donations) {
    if (!SETTLED.has(d.status)) continue;
    const mk = monthKeyOf(d.settled_at ?? d.donated_at, timeZone);
    const label = d.project_id ? (input.sponsorshipProjectIds.has(d.project_id) ? "Sponsorships" : d.project_title ?? "Projects") : d.fund_name || "General Fund";
    add(rev, label, mk, d.amount_cents - d.refunded_cents);
    add(exp, FEES_LABEL, mk, d.fee_cents);
  }
  for (const e of input.expenses) if (e.approval === "approved") add(exp, e.category_name, monthKeyOf(e.expense_date, timeZone), e.amount_cents);

  const line = (label: string, row: Map<string, number> | undefined): PnlLine => {
    const monthly = yearKeys.map((k) => row?.get(k) ?? 0);
    return { label, monthly, current: monthly[month - 1], prior: row?.get(priorKey) ?? 0, ytd: monthly.slice(0, month).reduce((s, v) => s + v, 0) };
  };
  const section = (m: Map<string, Map<string, number>>, totalLabel: string): PnlSection => {
    const lines = [...m.entries()].map(([label, row]) => line(label, row))
      .sort((a, b) => (a.label === FEES_LABEL ? 1 : b.label === FEES_LABEL ? -1 : 0) || b.ytd - a.ytd || a.label.localeCompare(b.label));
    return { lines, total: sumLines(totalLabel, lines) };
  };
  const revenue = section(rev, "Total revenue"), expenses = section(exp, "Total expenses");
  return { year, month, revenue, expenses, net: diffLine("Net income (loss)", revenue.total, expenses.total) };
}

function sumLines(label: string, lines: PnlLine[]): PnlLine {
  return {
    label, monthly: Array.from({ length: 12 }, (_, i) => lines.reduce((s, l) => s + l.monthly[i], 0)),
    current: lines.reduce((s, l) => s + l.current, 0), prior: lines.reduce((s, l) => s + l.prior, 0), ytd: lines.reduce((s, l) => s + l.ytd, 0),
  };
}
function diffLine(label: string, a: PnlLine, b: PnlLine): PnlLine {
  return { label, monthly: a.monthly.map((v, i) => v - b.monthly[i]), current: a.current - b.current, prior: a.prior - b.prior, ytd: a.ytd - b.ytd };
}

/** Change from prior month as a fraction (0.25 = +25%); null when the prior month was zero. */
export function changePct(current: number, prior: number): number | null {
  return prior === 0 ? null : (current - prior) / Math.abs(prior);
}

/** The current "YYYY-MM" in the org's timezone (default for the monthly P&L download). */
export function currentMonthKey(timeZone: string, now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone }).slice(0, 7);
}
