import { describe, expect, it } from "vitest";
import {
  buildFinancialReport, fiscalYearBounds, fiscalYearOf, parseReportFilters,
  type FDonation, type FExpense, type ReportInput,
} from "@/lib/reports/financials";

const TZ = "America/Los_Angeles";
let n = 0;
const don = (o: Partial<FDonation> = {}): FDonation => ({
  id: `d${++n}`, donor_id: "a", amount_cents: 10000, refunded_cents: 0, fee_cents: 320, status: "succeeded", frequency: "one_time",
  payment_method: "card", is_offline: false, fund_id: "f-gen", fund_name: "General Fund", restriction: "unrestricted", project_id: null, project_title: null,
  settled_at: "2026-03-10T18:00:00Z", donated_at: "2026-03-10T18:00:00Z", ...o,
});
const exp = (o: Partial<FExpense> = {}): FExpense => ({
  id: `e${++n}`, expense_date: "2026-03-15", amount_cents: 2000, category_id: "c-prog", category_name: "Program Services", functional_class: "program",
  project_id: null, project_title: null, restriction: "unrestricted", approval: "approved", ...o,
});
const input = (o: Partial<ReportInput> = {}): ReportInput => ({
  donations: [], expenses: [], budgets: [], categories: [{ id: "c-prog", name: "Program Services" }, { id: "c-mgmt", name: "Admin" }],
  tz: TZ, fiscalStartMonth: 1, filters: { from: "2026-01-01", to: "2026-12-31" }, ...o,
});
const project = { project_id: "p1", project_title: "Wells", fund_id: "f-p1", fund_name: "Wells", restriction: "restricted" as const };

describe("revenue definitions", () => {
  const r = buildFinancialReport(input({
    donations: [
      don(),                                                                                   // 100.00
      don({ status: "partially_refunded", amount_cents: 20000, refunded_cents: 5000 }),        // 200.00, 50.00 back
      don({ status: "refunded", amount_cents: 3000, refunded_cents: 3000 }),
      don({ is_offline: true, payment_method: "offline", fee_cents: 0, amount_cents: 7000 }),
      don({ status: "pending", amount_cents: 99999 }), don({ status: "failed", amount_cents: 88888 }), don({ status: "canceled", amount_cents: 77777 }),
      don({ status: "disputed", amount_cents: 4000 }),
    ],
  }));
  it("counts only settled gifts and reports disputes separately", () => {
    expect(r.revenue.gross).toBe(10000 + 20000 + 3000 + 7000);
    expect(r.revenue.refunds).toBe(5000 + 3000);
    expect(r.revenue.netContribution).toBe(40000 - 8000);
    expect(r.revenue.disputedExcluded).toBe(4000);
    expect(r.revenue.offline).toBe(7000);
    expect(r.revenue.gifts).toBe(4);
  });
  it("subtracts processing fees to get net proceeds", () => {
    expect(r.revenue.fees).toBe(320 * 3);
    expect(r.revenue.netProceeds).toBe(32000 - 960);
  });
});

describe("expenses and net operating result", () => {
  it("counts approved expenses only, and reports pending ones as excluded", () => {
    const r = buildFinancialReport(input({
      donations: [don()],
      expenses: [exp(), exp({ amount_cents: 500, approval: "pending" }), exp({ amount_cents: 900, approval: "rejected" }), exp({ expense_date: "2025-12-31", amount_cents: 7777 })],
    }));
    expect(r.expenses.total).toBe(2000);
    expect(r.expenses.pendingExcluded).toEqual({ count: 1, cents: 500 });
    expect(r.netOperating).toBe(10000 - 320 - 2000);
  });
  it("groups expenses by category and project", () => {
    const r = buildFinancialReport(input({ expenses: [exp(), exp({ amount_cents: 1000, category_id: "c-mgmt", category_name: "Admin", project_id: "p1", project_title: "Wells" })] }));
    expect(r.expenses.byCategory).toEqual([{ name: "Program Services", cents: 2000 }, { name: "Admin", cents: 1000 }]);
    expect(r.expenses.byProject).toEqual([{ name: "Not project-specific", cents: 2000 }, { name: "Wells", cents: 1000 }]);
  });
});

describe("statement of activities", () => {
  const r = buildFinancialReport(input({
    donations: [don(), don({ ...project, amount_cents: 50000, fee_cents: 1500 })],
    expenses: [
      exp({ amount_cents: 3000 }),                                                                       // unrestricted program
      exp({ amount_cents: 1000, functional_class: "management", category_id: "c-mgmt", category_name: "Admin" }),
      exp({ amount_cents: 20000, restriction: "restricted", project_id: "p1", project_title: "Wells" }), // restricted program
    ],
  }));
  it("splits activity by restriction with fees following the gift", () => {
    expect(r.statementOfActivities.unrestricted).toMatchObject({ revenue: 10000, program: 3000, management: 1000, fundraising: 320, expenses: 4320, change: 5680 });
    expect(r.statementOfActivities.restricted).toMatchObject({ revenue: 50000, program: 20000, fundraising: 1500, expenses: 21500, change: 28500 });
  });
  it("totals reconcile with the management P&L", () => {
    const t = r.statementOfActivities.total;
    expect(t.change).toBe(r.netOperating);
    expect(t.revenue).toBe(r.revenue.netContribution);
    expect(t.expenses).toBe(r.expenses.total + r.revenue.fees);
  });
});

describe("filters", () => {
  const donations = [
    don({ donor_id: "a" }), don({ donor_id: "b", frequency: "monthly" }), don({ donor_id: "c", payment_method: "us_bank_account" }),
    don({ ...project, donor_id: "a" }),
  ];
  const gross = (filters: Partial<ReportInput["filters"]>) => buildFinancialReport(input({ donations, filters: { from: "2026-01-01", to: "2026-12-31", ...filters } })).revenue.gross;
  it("filters by donor, frequency, method, project and restriction", () => {
    expect(gross({ donorId: "a" })).toBe(20000);
    expect(gross({ frequency: "monthly" })).toBe(10000);
    expect(gross({ method: "us_bank_account" })).toBe(10000);
    expect(gross({ projectId: "p1" })).toBe(10000);
    expect(gross({ restriction: "restricted" })).toBe(10000);
    expect(gross({ restriction: "unrestricted" })).toBe(30000);
  });
  it("applies the date range in the organization time zone", () => {
    const late = don({ settled_at: "2027-01-01T05:00:00Z" }); // still Dec 31, 2026 in Pacific time
    const r = buildFinancialReport(input({ donations: [late], filters: { from: "2026-12-31", to: "2026-12-31" } }));
    expect(r.revenue.gross).toBe(10000);
    expect(buildFinancialReport(input({ donations: [late], filters: { from: "2027-01-01", to: "2027-01-31" } })).revenue.gross).toBe(0);
  });
  it("reports gifts with a status filter only among settled statuses", () => {
    const refundedOnly = buildFinancialReport(input({ donations: [don({ status: "refunded", refunded_cents: 10000 }), don()], filters: { from: "2026-01-01", to: "2026-12-31", status: "refunded" } }));
    expect(refundedOnly.revenue.gross).toBe(10000);
    expect(refundedOnly.revenue.netContribution).toBe(0);
  });
});

describe("periods, comparisons and budgets", () => {
  it("builds monthly rows including empty months and a yearly comparison across all years", () => {
    const r = buildFinancialReport(input({
      donations: [don({ settled_at: "2026-01-10T18:00:00Z" }), don({ settled_at: "2026-03-10T18:00:00Z" }), don({ settled_at: "2025-06-10T18:00:00Z", amount_cents: 5000 })],
      filters: { from: "2026-01-01", to: "2026-03-31" },
    }));
    expect(r.monthly.map((m) => [m.month, m.gross])).toEqual([["2026-01", 10000], ["2026-02", 0], ["2026-03", 10000]]);
    expect(r.yearly.map((y) => [y.year, y.netContribution])).toEqual([[2025, 5000], [2026, 20000]]);
  });
  it("computes fiscal year bounds and labels", () => {
    expect(fiscalYearOf("2026-06-30", 7)).toBe(2025);
    expect(fiscalYearOf("2026-07-01", 7)).toBe(2026);
    expect(fiscalYearBounds(2025, 7)).toEqual({ from: "2025-07-01", to: "2026-06-30" });
    expect(fiscalYearBounds(2026, 1)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("compares budget with fiscal-year-to-date actuals", () => {
    const r = buildFinancialReport(input({
      budgets: [{ fiscal_year: 2026, category_id: "c-prog", amount_cents: 10000 }, { fiscal_year: 2025, category_id: "c-prog", amount_cents: 1 }],
      expenses: [exp({ amount_cents: 4000 }), exp({ expense_date: "2026-11-01", amount_cents: 999 })],
      filters: { from: "2026-03-01", to: "2026-03-31" },
    }));
    expect(r.budget).toEqual({ fiscalYear: 2026, rows: [{ category: "Program Services", budget: 10000, actual: 4000, variance: 6000 }] });
  });
});

describe("parseReportFilters", () => {
  const fb = { from: "2026-01-01", to: "2026-12-31" };
  it("drops invalid values and enforces the donor-filter permission", () => {
    const f = parseReportFilters({ from: "nope", frequency: "weekly", method: "bitcoin", status: "pending", restriction: "x", donor: "5f0b1a4e-1c1e-4b7e-9a51-1f2f3a4b5c6d" }, fb, false);
    expect(f).toEqual({ ...fb, fundId: undefined, projectId: undefined, categoryId: undefined, donorId: undefined, frequency: undefined, method: undefined, status: undefined, restriction: undefined });
    expect(parseReportFilters({ donor: "5f0b1a4e-1c1e-4b7e-9a51-1f2f3a4b5c6d" }, fb, true).donorId).toBeDefined();
  });
  it("a calendar year overrides the range; inverted ranges fall back", () => {
    expect(parseReportFilters({ year: "2024" }, fb, false)).toMatchObject({ from: "2024-01-01", to: "2024-12-31" });
    expect(parseReportFilters({ from: "2026-05-01", to: "2026-01-01" }, fb, false)).toMatchObject(fb);
  });
});
