import { describe, expect, it } from "vitest";
import { buildPnl, changePct, FEES_LABEL, monthKeyOf } from "@/lib/reports/pnl";
import { pnlWorkbook } from "@/lib/reports/pnl-xlsx";
import { readXlsx } from "@/lib/admin/dp-import";

const gift = (cents: number, at: string, extra: Partial<Parameters<typeof buildPnl>[0]["donations"][number]> = {}) => ({
  amount_cents: cents, refunded_cents: 0, fee_cents: 0, status: "succeeded", settled_at: at, donated_at: at,
  project_id: null, project_title: null, fund_name: "General Fund", ...extra,
});
const exp = (cents: number, date: string, category = "Program", approval = "approved") => ({ expense_date: date, amount_cents: cents, category_name: category, approval });

const pnl = buildPnl({
  year: 2026, month: 9, timeZone: "America/Los_Angeles", sponsorshipProjectIds: new Set(["sp1"]),
  donations: [
    gift(10000, "2026-09-10T18:00:00Z", { fee_cents: 320 }),
    gift(5000, "2026-09-15T18:00:00Z", { project_id: "p1", project_title: "Education" }),
    gift(8500, "2026-09-20T18:00:00Z", { project_id: "sp1", project_title: "Sponsor: Jane" }),
    gift(4000, "2026-08-05T18:00:00Z", { refunded_cents: 1000 }),
    gift(9999, "2026-09-11T18:00:00Z", { status: "failed" }),
    gift(7000, "2026-01-02T18:00:00Z"),
    gift(1000, "2026-10-01T06:30:00Z"), // still Sept 30 in Los Angeles
  ],
  expenses: [exp(3000, "2026-09-03"), exp(2000, "2026-08-20", "Admin"), exp(9999, "2026-09-04", "Program", "pending")],
});
const find = (lines: { label: string }[], label: string) => lines.find((l) => l.label === label) as (typeof pnl.revenue.lines)[number];

describe("buildPnl", () => {
  it("counts settled gifts net of refunds, by designation, in the org's month", () => {
    expect(find(pnl.revenue.lines, "General Fund").current).toBe(11000); // 10,000 + the 30 Sept (LA) gift
    expect(find(pnl.revenue.lines, "Education").current).toBe(5000);
    expect(find(pnl.revenue.lines, "Sponsorships").current).toBe(8500); // never named by person
    expect(find(pnl.revenue.lines, "General Fund").prior).toBe(3000); // August, net of the $10 refund
    expect(pnl.revenue.total.current).toBe(24500);
  });
  it("includes approved expenses and processing fees only", () => {
    expect(find(pnl.expenses.lines, "Program").current).toBe(3000);
    expect(find(pnl.expenses.lines, FEES_LABEL).current).toBe(320);
    expect(find(pnl.expenses.lines, "Admin").prior).toBe(2000);
    expect(pnl.expenses.lines.at(-1)!.label).toBe(FEES_LABEL);
  });
  it("computes net, year to date and the monthly row", () => {
    expect(pnl.net.current).toBe(24500 - 3320);
    expect(pnl.net.prior).toBe(3000 - 2000);
    expect(pnl.revenue.total.ytd).toBe(7000 + 3000 + 24500);
    expect(pnl.revenue.total.monthly[0]).toBe(7000);
    expect(pnl.revenue.total.monthly[9]).toBe(0);
  });
  it("uses December of the previous year as January's prior month", () => {
    const jan = buildPnl({ year: 2026, month: 1, timeZone: "UTC", sponsorshipProjectIds: new Set(), donations: [gift(500, "2025-12-15T12:00:00Z"), gift(800, "2026-01-15T12:00:00Z")], expenses: [] });
    expect(jan.revenue.total.prior).toBe(500);
    expect(jan.revenue.total.ytd).toBe(800);
  });
});

describe("helpers", () => {
  it("changePct and monthKeyOf", () => {
    expect(changePct(150, 100)).toBe(0.5);
    expect(changePct(50, -100)).toBe(1.5);
    expect(changePct(10, 0)).toBeNull();
    expect(monthKeyOf("2026-09-30", "UTC")).toBe("2026-09");
  });
});

describe("pnlWorkbook", () => {
  it("writes a valid .xlsx whose first sheet compares the month with the prior month", () => {
    const rows = readXlsx(pnlWorkbook(pnl, "Mission Giving", new Date("2026-10-01T12:00:00Z")));
    expect(rows[0][0]).toBe("Mission Giving — Profit & Loss");
    expect(rows.find((r) => r[0] === "Total revenue")).toEqual(["Total revenue", "245", "30", "215", "7.166666666666667", "345"]);
    expect(rows.find((r) => r[0] === "Net income (loss)")?.[1]).toBe("211.8");
  });
});
