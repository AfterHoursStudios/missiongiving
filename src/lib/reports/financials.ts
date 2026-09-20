import { zoned } from "@/lib/admin/metrics";

/**
 * MANAGEMENT REPORTING DEFINITIONS (not accounting advice; have an accountant review before official use)
 *
 * - Revenue counts only SETTLED donations: succeeded, partially_refunded, refunded. Pending, processing, failed,
 *   canceled are not revenue. DISPUTED gifts are excluded and shown on their own line (funds are held by the processor).
 * - A donation's date is when it settled (falls back to when it was made). Offline gifts are included and shown separately.
 * - Gross donations = sum of settled donation amounts. Refunds = refunded amount on those donations (full and partial).
 *   The refund date is NOT tracked per refund, so refunds are reported in the period of the original donation.
 * - Net contribution revenue = gross - refunds. Processing fees are treated as an expense (fundraising class).
 * - Only APPROVED expenses count; pending/rejected are reported as excluded.
 * - Restricted vs unrestricted follows the fund a gift was made to (project funds are restricted) and the
 *   classification chosen on each expense. Release of restricted net assets is not modeled.
 */

export type Restriction = "restricted" | "unrestricted";
export type FunctionalClass = "program" | "fundraising" | "management";
export const SETTLED = ["succeeded", "partially_refunded", "refunded"] as const;

export interface FDonation {
  id: string; donor_id: string; amount_cents: number; refunded_cents: number; fee_cents: number; status: string;
  frequency: string; payment_method: string; is_offline: boolean;
  fund_id: string | null; fund_name: string; restriction: Restriction; project_id: string | null; project_title: string | null;
  settled_at: string | null; donated_at: string;
}
export interface FExpense {
  id: string; expense_date: string; amount_cents: number; category_id: string; category_name: string;
  functional_class: FunctionalClass; project_id: string | null; project_title: string | null; restriction: Restriction; approval: string;
}
export interface FBudget { fiscal_year: number; category_id: string; amount_cents: number }

export interface ReportFilters {
  from: string; to: string; // inclusive YYYY-MM-DD
  fundId?: string; projectId?: string; frequency?: string; method?: string; donorId?: string; status?: string;
  categoryId?: string; restriction?: Restriction;
}
export interface ReportInput {
  donations: FDonation[]; expenses: FExpense[]; budgets: FBudget[]; categories: { id: string; name: string }[];
  tz: string; fiscalStartMonth: number; filters: ReportFilters;
}

interface Money { gross: number; refunds: number; fees: number; net: number }
const zero = (): Money => ({ gross: 0, refunds: 0, fees: 0, net: 0 });

export interface ColumnTotals { revenue: number; program: number; fundraising: number; management: number; expenses: number; change: number }
export interface FinancialReport {
  filters: ReportFilters;
  revenue: { gross: number; offline: number; refunds: number; disputedExcluded: number; netContribution: number; fees: number; netProceeds: number; gifts: number };
  expenses: { total: number; byCategory: { name: string; cents: number }[]; byProject: { name: string; cents: number }[]; pendingExcluded: { count: number; cents: number } };
  netOperating: number;
  monthly: { month: string; gross: number; refunds: number; fees: number; expenses: number; net: number }[];
  yearly: { year: number; netContribution: number; fees: number; expenses: number; net: number }[];
  byFund: { name: string; gross: number; refunds: number; net: number }[];
  byProject: { name: string; gross: number; refunds: number; net: number }[];
  restrictedActivity: Record<Restriction, { revenue: number; expenses: number; change: number }>;
  statementOfActivities: Record<Restriction | "total", ColumnTotals>;
  budget: { fiscalYear: number; rows: { category: string; budget: number; actual: number; variance: number }[] };
}

const isSettled = (d: FDonation) => (SETTLED as readonly string[]).includes(d.status);
const dateOf = (d: FDonation, tz: string) => { const p = zoned(d.settled_at ?? d.donated_at, tz); return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; };

/** Fiscal year label = calendar year in which the fiscal year STARTS. */
export function fiscalYearOf(date: string, startMonth: number): number {
  const [y, m] = date.split("-").map(Number);
  return m >= startMonth ? y : y - 1;
}
export function fiscalYearBounds(fiscalYear: number, startMonth: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${fiscalYear}-${pad(startMonth)}-01`;
  const endY = startMonth === 1 ? fiscalYear : fiscalYear + 1;
  const endM = startMonth === 1 ? 12 : startMonth - 1;
  const last = new Date(Date.UTC(endY, endM, 0)).getUTCDate();
  return { from, to: `${endY}-${pad(endM)}-${pad(last)}` };
}

function months(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ey, em] = to.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, "0")}`); if (++m > 12) { m = 1; y++; } }
  return out;
}

export function buildFinancialReport(input: ReportInput): FinancialReport {
  const { filters: f, tz } = input;
  const donationMatches = (d: FDonation) =>
    (!f.fundId || d.fund_id === f.fundId) && (!f.projectId || d.project_id === f.projectId) &&
    (!f.frequency || d.frequency === f.frequency) && (!f.method || d.payment_method === f.method) &&
    (!f.donorId || d.donor_id === f.donorId) && (!f.status || d.status === f.status) && (!f.restriction || d.restriction === f.restriction);
  const expenseMatches = (e: FExpense) =>
    (!f.projectId || e.project_id === f.projectId) && (!f.categoryId || e.category_id === f.categoryId) && (!f.restriction || e.restriction === f.restriction);
  const inRange = (date: string) => date >= f.from && date <= f.to;

  const dons = input.donations.filter(donationMatches);
  const settledAll = dons.filter(isSettled);
  const settled = settledAll.filter((d) => inRange(dateOf(d, tz)));
  const disputed = dons.filter((d) => d.status === "disputed" && inRange(dateOf(d, tz)));
  const exps = input.expenses.filter(expenseMatches);
  const approved = exps.filter((e) => e.approval === "approved" && inRange(e.expense_date));
  const pending = exps.filter((e) => e.approval === "pending" && inRange(e.expense_date));

  const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const gross = sum(settled, (d) => d.amount_cents);
  const refunds = sum(settled, (d) => d.refunded_cents);
  const fees = sum(settled, (d) => d.fee_cents);
  const expenseTotal = sum(approved, (e) => e.amount_cents);
  const netContribution = gross - refunds;

  const group = <T,>(rows: T[], key: (r: T) => string, pick: (r: T) => number) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + pick(r));
    return [...m].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
  };
  const moneyBy = (key: (d: FDonation) => string) => {
    const m = new Map<string, Money>();
    for (const d of settled) { const v = m.get(key(d)) ?? zero(); v.gross += d.amount_cents; v.refunds += d.refunded_cents; v.net += d.amount_cents - d.refunded_cents; m.set(key(d), v); }
    return [...m].map(([name, v]) => ({ name, gross: v.gross, refunds: v.refunds, net: v.net })).sort((a, b) => b.net - a.net);
  };

  // Monthly comparison inside the selected range
  const monthly = months(f.from, f.to).map((month) => {
    const d = settled.filter((x) => dateOf(x, tz).startsWith(month));
    const e = approved.filter((x) => x.expense_date.startsWith(month));
    const g = sum(d, (x) => x.amount_cents), r = sum(d, (x) => x.refunded_cents), fe = sum(d, (x) => x.fee_cents), ex = sum(e, (x) => x.amount_cents);
    return { month, gross: g, refunds: r, fees: fe, expenses: ex, net: g - r - fe - ex };
  });

  // Yearly comparison ignores the date range (all years), honoring the other filters
  const years = new Map<number, { nc: number; fees: number; exp: number }>();
  const bump = (y: number) => years.get(y) ?? years.set(y, { nc: 0, fees: 0, exp: 0 }).get(y)!;
  for (const d of settledAll) { const y = Number(dateOf(d, tz).slice(0, 4)); const v = bump(y); v.nc += d.amount_cents - d.refunded_cents; v.fees += d.fee_cents; }
  for (const e of exps.filter((x) => x.approval === "approved")) bump(Number(e.expense_date.slice(0, 4))).exp += e.amount_cents;
  const yearly = [...years].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, netContribution: v.nc, fees: v.fees, expenses: v.exp, net: v.nc - v.fees - v.exp }));

  // Statement of Activities by restriction
  const col = (r?: Restriction): ColumnTotals => {
    const d = settled.filter((x) => !r || x.restriction === r);
    const e = approved.filter((x) => !r || x.restriction === r);
    const cls = (c: FunctionalClass) => sum(e.filter((x) => x.functional_class === c), (x) => x.amount_cents);
    const revenue = sum(d, (x) => x.amount_cents - x.refunded_cents);
    const program = cls("program"), management = cls("management");
    const fundraising = cls("fundraising") + sum(d, (x) => x.fee_cents); // processing fees follow the gift's restriction
    const expenses = program + fundraising + management;
    return { revenue, program, fundraising, management, expenses, change: revenue - expenses };
  };
  const unrestricted = col("unrestricted"), restricted = col("restricted");
  const activity = (c: ColumnTotals) => ({ revenue: c.revenue, expenses: c.expenses, change: c.change });

  // Budget vs actual for the fiscal year containing the end of the range
  const fy = fiscalYearOf(f.to, input.fiscalStartMonth);
  const bounds = fiscalYearBounds(fy, input.fiscalStartMonth);
  const actualByCat = new Map<string, number>();
  for (const e of exps.filter((x) => x.approval === "approved" && x.expense_date >= bounds.from && x.expense_date <= f.to))
    actualByCat.set(e.category_id, (actualByCat.get(e.category_id) ?? 0) + e.amount_cents);
  const budgets = input.budgets.filter((b) => b.fiscal_year === fy);
  const catIds = new Set([...budgets.map((b) => b.category_id), ...actualByCat.keys()]);
  const budgetRows = [...catIds].map((id) => {
    const budget = budgets.find((b) => b.category_id === id)?.amount_cents ?? 0;
    const actual = actualByCat.get(id) ?? 0;
    return { category: input.categories.find((c) => c.id === id)?.name ?? "Uncategorized", budget, actual, variance: budget - actual };
  }).sort((a, b) => a.category.localeCompare(b.category));

  return {
    filters: f,
    revenue: { gross, offline: sum(settled.filter((d) => d.is_offline), (d) => d.amount_cents), refunds, disputedExcluded: sum(disputed, (d) => d.amount_cents), netContribution, fees, netProceeds: netContribution - fees, gifts: settled.length },
    expenses: {
      total: expenseTotal, byCategory: group(approved, (e) => e.category_name, (e) => e.amount_cents),
      byProject: group(approved, (e) => e.project_title ?? "Not project-specific", (e) => e.amount_cents),
      pendingExcluded: { count: pending.length, cents: sum(pending, (e) => e.amount_cents) },
    },
    netOperating: netContribution - fees - expenseTotal,
    monthly, yearly,
    byFund: moneyBy((d) => d.fund_name), byProject: moneyBy((d) => d.project_title ?? "Not project-specific"),
    restrictedActivity: { restricted: activity(restricted), unrestricted: activity(unrestricted) },
    statementOfActivities: { unrestricted, restricted, total: col() },
    budget: { fiscalYear: fy, rows: budgetRows },
  };
}

/** Parses report filters from URL params. Unknown/invalid values are dropped rather than trusted. */
export function parseReportFilters(sp: Record<string, string | undefined>, fallback: { from: string; to: string }, canFilterDonor: boolean): ReportFilters {
  const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  let from = date(sp.from) ?? fallback.from, to = date(sp.to) ?? fallback.to;
  if (sp.year && /^\d{4}$/.test(sp.year)) { from = `${sp.year}-01-01`; to = `${sp.year}-12-31`; }
  if (from > to) { from = fallback.from; to = fallback.to; }
  return {
    from, to, fundId: uuid(sp.fund), projectId: uuid(sp.project), categoryId: uuid(sp.category),
    donorId: canFilterDonor ? uuid(sp.donor) : undefined,
    frequency: ["one_time", "monthly", "yearly"].includes(sp.frequency ?? "") ? sp.frequency : undefined,
    method: ["card", "us_bank_account", "offline"].includes(sp.method ?? "") ? sp.method : undefined,
    status: (SETTLED as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined,
    restriction: sp.restriction === "restricted" || sp.restriction === "unrestricted" ? sp.restriction : undefined,
  };
}
