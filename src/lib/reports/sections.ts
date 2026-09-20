import { formatMoney } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import type { FinancialReport, ReportFilters } from "./financials";

export type ReportType = "pl" | "soa";
export const REPORT_TITLES: Record<ReportType, string> = { pl: "Management Profit & Loss", soa: "Statement of Activities" };

export const DISCLAIMER =
  "Internal reports are management tools and should be reviewed by Ultimate Mission's accountant before use for official tax or audited financial reporting.";

export interface Section { title: string; note?: string; columns: string[]; rows: (string | number)[][]; money: number[] }

/**
 * The single source for the on-screen tables, CSV and PDF, so the three outputs can never disagree.
 * `money` lists column indexes holding integer cents.
 */
export function buildSections(r: FinancialReport, type: ReportType): Section[] {
  if (type === "soa") {
    const { unrestricted: u, restricted: s, total: t } = r.statementOfActivities;
    const row = (label: string, k: keyof typeof t) => [label, u[k], s[k], t[k]];
    return [
      {
        title: "Statement of Activities", money: [1, 2, 3], columns: ["", "Without donor restrictions", "With donor restrictions", "Total"],
        note: "Revenue is contributions net of refunds. Processing fees are shown within fundraising expenses (classification is a management assumption). Release of restricted net assets is not modeled.",
        rows: [
          row("Contributions, net of refunds", "revenue"),
          row("Total revenue and support", "revenue"),
          row("Program services", "program"),
          row("Fundraising (including processing fees)", "fundraising"),
          row("Management and general", "management"),
          row("Total expenses", "expenses"),
          row("Change in net assets", "change"),
        ],
      },
    ];
  }
  const rev = r.revenue;
  return [
    {
      title: "Summary", money: [1], columns: ["Line", "Amount"],
      rows: [
        ["Gross donations (settled)", rev.gross], ["  of which offline gifts", rev.offline], ["Less: refunds and partial refunds", -rev.refunds],
        ["Net contribution revenue", rev.netContribution], ["Less: payment-processing fees", -rev.fees], ["Less: recorded expenses (approved)", -r.expenses.total],
        ["Net operating result", r.netOperating],
        ["Memo: disputed gifts (excluded from revenue)", rev.disputedExcluded],
        ["Memo: pending/unapproved expenses (excluded)", r.expenses.pendingExcluded.cents],
      ],
    },
    { title: "Revenue and expenses by month", money: [1, 2, 3, 4, 5], columns: ["Month", "Gross", "Refunds", "Fees", "Expenses", "Net"], rows: r.monthly.map((m) => [m.month, m.gross, m.refunds, m.fees, m.expenses, m.net]) },
    { title: "Yearly comparison (all years, other filters applied)", money: [1, 2, 3, 4], columns: ["Year", "Net contribution", "Fees", "Expenses", "Net"], rows: r.yearly.map((y) => [String(y.year), y.netContribution, y.fees, y.expenses, y.net]) },
    { title: "Revenue by fund", money: [1, 2, 3], columns: ["Fund", "Gross", "Refunds", "Net"], rows: r.byFund.map((x) => [x.name, x.gross, x.refunds, x.net]) },
    { title: "Revenue by project", money: [1, 2, 3], columns: ["Project", "Gross", "Refunds", "Net"], rows: r.byProject.map((x) => [x.name, x.gross, x.refunds, x.net]) },
    { title: "Expenses by category", money: [1], columns: ["Category", "Amount"], rows: r.expenses.byCategory.map((x) => [x.name, x.cents]) },
    { title: "Expenses by project", money: [1], columns: ["Project", "Amount"], rows: r.expenses.byProject.map((x) => [x.name, x.cents]) },
    {
      title: "Restricted and unrestricted activity", money: [1, 2, 3], columns: ["Class", "Revenue", "Expenses", "Change"],
      rows: (["unrestricted", "restricted"] as const).map((k) => [k === "restricted" ? "Restricted" : "Unrestricted", r.restrictedActivity[k].revenue, r.restrictedActivity[k].expenses, r.restrictedActivity[k].change]),
    },
    {
      title: `Budget versus actual, fiscal year ${r.budget.fiscalYear} to date`, money: [1, 2, 3],
      note: r.budget.rows.length === 0 ? "No budget entered for this fiscal year." : "Budget is the full-year amount; actual is approved expenses from the start of the fiscal year through the end of the selected period.",
      columns: ["Category", "Budget", "Actual", "Remaining"], rows: r.budget.rows.map((x) => [x.category, x.budget, x.actual, x.variance]),
    },
  ];
}

/** Human-readable filter list for report headers. Only non-default filters are shown. */
export function describeFilters(f: ReportFilters, names: { fund?: string; project?: string; category?: string } = {}): string[] {
  const out = [`Period: ${f.from} to ${f.to}`];
  if (f.fundId) out.push(`Fund: ${names.fund ?? f.fundId}`);
  if (f.projectId) out.push(`Project: ${names.project ?? f.projectId}`);
  if (f.frequency) out.push(`Frequency: ${f.frequency.replace("_", " ")}`);
  if (f.method) out.push(`Payment method: ${f.method.replace(/_/g, " ")}`);
  if (f.donorId) out.push("Donor: filtered");
  if (f.status) out.push(`Donation status: ${f.status.replace("_", " ")}`);
  if (f.categoryId) out.push(`Expense category: ${names.category ?? f.categoryId}`);
  if (f.restriction) out.push(`Classification: ${f.restriction}`);
  return out;
}

export const cell = (v: string | number, isMoney: boolean, currency = "USD") => (isMoney && typeof v === "number" ? formatMoney(v, currency) : String(v));

export function sectionsToCsv(sections: Section[], header: string[]): string {
  const blocks = [toCsv(["Report", ...header.slice(0, 1)], header.slice(1).map((h) => [h])).trimEnd()];
  for (const s of sections) {
    const rows = s.rows.map((r) => r.map((v, i) => (s.money.includes(i) && typeof v === "number" ? (v / 100).toFixed(2) : v)));
    blocks.push(toCsv([s.title], []).trimEnd() + "\r\n" + toCsv(s.columns, rows).trimEnd());
  }
  return blocks.join("\r\n\r\n") + "\r\n";
}
