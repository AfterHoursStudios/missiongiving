import { describe, expect, it } from "vitest";
import { buildFinancialReport, type FDonation, type FExpense } from "@/lib/reports/financials";
import { buildSections, describeFilters, sectionsToCsv, DISCLAIMER } from "@/lib/reports/sections";
import { renderReportPdf } from "@/lib/reports/pdf";

const donation: FDonation = {
  id: "d", donor_id: "a", amount_cents: 12345, refunded_cents: 345, fee_cents: 400, status: "partially_refunded", frequency: "one_time", payment_method: "card",
  is_offline: false, fund_id: "f", fund_name: "=Evil Fund", restriction: "unrestricted", project_id: null, project_title: null,
  settled_at: "2026-02-01T12:00:00Z", donated_at: "2026-02-01T12:00:00Z",
};
const expense: FExpense = { id: "e", expense_date: "2026-02-02", amount_cents: 1000, category_id: "c", category_name: "Program Services", functional_class: "program", project_id: null, project_title: null, restriction: "unrestricted", approval: "approved" };
const report = buildFinancialReport({ donations: [donation], expenses: [expense], budgets: [], categories: [], tz: "America/Los_Angeles", fiscalStartMonth: 1, filters: { from: "2026-01-01", to: "2026-03-31" } });

describe("report outputs agree", () => {
  it("P&L summary matches the report totals", () => {
    const summary = buildSections(report, "pl")[0];
    const get = (label: string) => summary.rows.find((r) => r[0] === label)![1];
    expect(get("Gross donations (settled)")).toBe(12345);
    expect(get("Net contribution revenue")).toBe(12000);
    expect(get("Net operating result")).toBe(12000 - 400 - 1000);
  });
  it("Statement of Activities columns sum to the total", () => {
    const [soa] = buildSections(report, "soa");
    for (const r of soa.rows) expect((r[1] as number) + (r[2] as number)).toBe(r[3]);
  });
  it("CSV writes dollars, includes the filters, and neutralizes formulas", () => {
    const csv = sectionsToCsv(buildSections(report, "pl"), ["Management Profit & Loss", ...describeFilters(report.filters)]);
    expect(csv).toContain("Period: 2026-01-01 to 2026-03-31");
    expect(csv).toContain("Gross donations (settled),123.45");
    expect(csv).toContain("'=Evil Fund"); // formula injection defused
    expect(csv).not.toMatch(/\b12345\b/);
  });
});

describe("PDF export", () => {
  it("renders a multi-section PDF", async () => {
    const buf = await renderReportPdf({ orgName: "Sample Org", title: "Management Profit & Loss", filters: describeFilters(report.filters), generatedAt: "2026-04-01", currency: "USD" }, buildSections(report, "pl"));
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2000);
  });
  it("spans multiple pages with many rows", async () => {
    const many = Array.from({ length: 120 }, (_, i) => [`Row ${i}`, i * 100]);
    const buf = await renderReportPdf({ orgName: "Sample Org", title: "Long", filters: [], generatedAt: "x", currency: "USD" }, [{ title: "Big", columns: ["Name", "Amount"], rows: many, money: [1] }]);
    expect((buf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
  it("carries the accountant-review disclaimer text", () => expect(DISCLAIMER).toMatch(/accountant/));
});
