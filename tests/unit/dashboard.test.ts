import { describe, expect, it } from "vitest";
import { addMonths, buildDashboard, givingByState, stateName, type DashGift } from "@/lib/reports/dashboard";

const g = (donorId: string, date: string, net = 10000): DashGift => ({ donorId, date, net });
const today = "2026-10-20";

describe("addMonths", () => {
  it("clamps to the end of shorter months and crosses years", () => {
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -12)).toBe("2025-01-15");
    expect(addMonths("2025-11-30", 3)).toBe("2026-02-28");
  });
});

describe("buildDashboard", () => {
  // Periods: this year = (2025-10-20, 2026-10-20], last year = (2024-10-20, 2025-10-20], before = up to 2024-10-20.
  const gifts = [
    g("a", "2025-03-01"), g("a", "2026-03-01"),            // retained
    g("b", "2025-05-01"),                                  // lapsed
    g("c", "2026-06-01", 30000),                           // new
    g("d", "2023-12-01"), g("d", "2026-07-01"),            // reactivated (skipped last year)
    g("e", "2024-12-01"), g("e", "2025-01-01"),            // gave last year only (lapsed), first gift last year (new then)
  ];
  const d = buildDashboard(gifts, { today, fiscalStartMonth: 1, goalCents: 100000 });

  it("classifies donors as new, retained, reactivated and lapsed", () => {
    expect(d.statuses).toEqual([
      { status: "New", current: 1, previous: 3 },
      { status: "Retained", current: 1, previous: 0 },
      { status: "Reactivated", current: 1, previous: 0 },
      { status: "Lapsed", current: -2, previous: -1 },
    ]);
  });

  it("computes retention as last year's donors who gave again", () => {
    // Last year: a, b, e. This year: a, c, d. Retained 1 of 3.
    expect(d.kpis.retention.pct).toBe(33.3);
  });

  it("computes growth, donors, average gift and the goal", () => {
    // This year 100 + 300 + 100 = 500; last year a 100 + b 100 + e 100 + e 100 = 400.
    expect(d.kpis.growth.pct).toBe(25);
    expect(d.kpis.growth.deltaCents).toBe(10000);
    expect(d.kpis.donors).toEqual({ value: 3, previous: 3, changePct: 0 });
    expect(d.kpis.averageGift.value).toBe(Math.round(50000 / 3));
    expect(d.goal).toMatchObject({ raised: 50000, pct: 50, fiscalYearLabel: "2026" }); // calendar 2026 to date
  });

  it("lines up each month with the same month a year earlier", () => {
    const mar = d.monthlyGiving.find((m) => m.month === "Mar 26");
    expect(mar).toEqual({ month: "Mar 26", current: 10000, previous: 10000 });
    expect(d.monthlyGiving).toHaveLength(12);
    expect(d.historyCycle.years).toEqual([2024, 2025, 2026]);
  });

  it("labels a fiscal year that starts mid-year", () => {
    expect(buildDashboard(gifts, { today, fiscalStartMonth: 7, goalCents: null }).goal).toMatchObject({ fiscalYearLabel: "2026–27", pct: null });
  });
});

describe("giving by state", () => {
  it("matches postal codes and full names, and skips other regions", () => {
    expect(stateName("wa")).toBe("Washington");
    expect(stateName(" New York ")).toBe("New York");
    expect(stateName("Ontario")).toBeNull();
    const regions: Record<string, string> = { a: "WA", b: "Washington", c: "BC" };
    expect(givingByState([g("a", today), g("b", today, 5000), g("c", today)], (id) => regions[id])).toEqual([{ state: "Washington", cents: 15000, donors: 2 }]);
  });
});
