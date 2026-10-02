import { writeXlsx, type Cell, type Sheet } from "@/lib/xlsx";
import { changePct, type Pnl, type PnlLine } from "./pnl";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const $ = (cents: number, bold = false): Cell => ({ v: cents / 100, s: bold ? "moneyBold" : "money" });

/**
 * The monthly P&L workbook: sheet 1 compares the month with the prior month (change in $ and %) and shows year to date;
 * sheet 2 lays the whole calendar year out by month with a year total (months after the report month are left blank).
 */
export function pnlWorkbook(pnl: Pnl, orgName: string, generatedAt = new Date()): Uint8Array {
  const { year, month } = pnl;
  const priorLabel = month === 1 ? `Dec ${year - 1}` : `${MONTHS[month - 2]} ${year}`;
  const title = `${LONG[month - 1]} ${year}`;

  const compare = (l: PnlLine, bold = false): Cell[] => {
    const pct = changePct(l.current, l.prior);
    return [{ v: l.label, s: bold ? "bold" : "text" }, $(l.current, bold), $(l.prior, bold), $(l.current - l.prior, bold), pct === null ? { v: "—", s: "text" } : { v: pct, s: "percent" }, $(l.ytd, bold)];
  };
  const summary: Cell[][] = [
    [{ v: `${orgName} — Profit & Loss`, s: "title" }],
    [{ v: `${title} (with prior month and year to date)`, s: "bold" }],
    [],
    ["", `${MONTHS[month - 1]} ${year}`, priorLabel, "Change ($)", "Change (%)", `Year to date ${year}`].map((v) => ({ v, s: "header" as const })),
    [{ v: "REVENUE", s: "bold" }],
    ...pnl.revenue.lines.map((l) => compare(l)),
    compare(pnl.revenue.total, true),
    [],
    [{ v: "EXPENSES", s: "bold" }],
    ...pnl.expenses.lines.map((l) => compare(l)),
    compare(pnl.expenses.total, true),
    [],
    compare(pnl.net, true),
    [],
    [{ v: "Revenue: settled gifts net of refunds, by designation, in the month they settled. Expenses: approved expenses by category, plus payment processing fees. Pending, failed and disputed gifts are excluded.", s: "text" }],
    [{ v: `Generated ${generatedAt.toLocaleString("en-US")}. Management report; have your accountant review before official use.`, s: "text" }],
  ];

  const byMonth = (l: PnlLine, bold = false): Cell[] => [
    { v: l.label, s: bold ? "bold" : "text" },
    ...l.monthly.map((c, i) => (i < month ? $(c, bold) : null)),
    $(l.ytd, bold),
  ];
  const yearRows: Cell[][] = [
    [{ v: `${orgName} — Profit & Loss by month, ${year}`, s: "title" }],
    [{ v: `Through ${title}`, s: "bold" }],
    [],
    ["", ...MONTHS, "Year total"].map((v) => ({ v, s: "header" as const })),
    [{ v: "REVENUE", s: "bold" }],
    ...pnl.revenue.lines.map((l) => byMonth(l)),
    byMonth(pnl.revenue.total, true),
    [],
    [{ v: "EXPENSES", s: "bold" }],
    ...pnl.expenses.lines.map((l) => byMonth(l)),
    byMonth(pnl.expenses.total, true),
    [],
    byMonth(pnl.net, true),
  ];

  const sheets: Sheet[] = [
    { name: `P&L ${MONTHS[month - 1]} ${year}`, rows: summary, widths: [34, 16, 16, 15, 12, 18], freezeRows: 4 },
    { name: `${year} by month`, rows: yearRows, widths: [34, ...Array(12).fill(13), 15], freezeRows: 4 },
  ];
  return writeXlsx(sheets);
}
