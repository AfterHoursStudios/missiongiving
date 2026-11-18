import { describe, expect, it } from "vitest";
import { displayValue, runDefinition, type Row } from "@/lib/reports/builder/engine";
import { defaultDefinition, definitionSchema, fieldOf, opsFor, periodError, resolvePeriod, restrictDefinition, type ReportDefinition } from "@/lib/reports/builder/fields";

const today = "2026-10-20";
const rows: Row[] = [
  { gift_date: "2026-01-05", amount: 5000, net: 5000, designation: "Wells", status: "succeeded", offline: false, donor_name: "Ann Lee", state: "WA" },
  { gift_date: "2026-03-10", amount: 25000, net: 20000, designation: "Wells", status: "partially_refunded", offline: true, donor_name: "Bob Ray", state: "OR" },
  { gift_date: "2025-12-31", amount: 10000, net: 10000, designation: null, status: "succeeded", offline: false, donor_name: "Cy Fox", state: null },
  { gift_date: "2026-10-01", amount: 7000, net: 7000, designation: "School", status: "failed", offline: false, donor_name: "Di Kim", state: "WA" },
];
const def = (over: Partial<ReportDefinition>): ReportDefinition => ({ source: "gifts", columns: ["donor_name", "amount", "net"], filters: [], sort: [], groupBy: null, summaryOnly: false, ...over });

describe("report builder engine", () => {
  it("filters with AND across fields", () => {
    const r = runDefinition(rows, def({ filters: [
      { field: "status", op: "in", values: ["succeeded", "partially_refunded"] },
      { field: "amount", op: "gte", value: "75" },
      { field: "gift_date", op: "this_year" },
    ] }), { today });
    expect(r.sections[0].rows.map((x) => x[0])).toEqual(["Bob Ray"]);
  });

  it("handles text, blank, yes/no and date ranges", () => {
    const names = (d: ReportDefinition) => runDefinition(rows, d, { today }).sections[0].rows.map((x) => x[0]);
    expect(names(def({ filters: [{ field: "designation", op: "blank" }] }))).toEqual(["Cy Fox"]);
    expect(names(def({ filters: [{ field: "donor_name", op: "contains", value: "ra" }] }))).toEqual(["Bob Ray"]);
    expect(names(def({ filters: [{ field: "offline", op: "true" }] }))).toEqual(["Bob Ray"]);
    expect(names(def({ filters: [{ field: "gift_date", op: "between", value: "2026-03-31", value2: "2025-12-01" }] }))).toEqual(["Ann Lee", "Bob Ray", "Cy Fox"]);
    expect(names(def({ filters: [{ field: "gift_date", op: "last_days", value: "30" }] }))).toEqual(["Di Kim"]);
    // A filter left half-filled in is ignored rather than hiding everything.
    expect(names(def({ filters: [{ field: "amount", op: "gte", value: "" }] }))).toHaveLength(4);
  });

  it("sorts with blanks last, then groups with subtotals and a grand total", () => {
    const r = runDefinition(rows, def({ sort: [{ field: "amount", dir: "desc" }], groupBy: "designation" }), { today });
    // Groups in A–Z order, with the "(blank)" group last.
    expect(r.sections.map((s) => [s.label, s.count, s.totals[1]])).toEqual([["School", 1, 7000], ["Wells", 2, 30000], ["(blank)", 1, 10000]]);
    expect(r.sections.find((s) => s.label === "Wells")!.rows.map((x) => x[0])).toEqual(["Bob Ray", "Ann Lee"]);
    expect(r.totals).toEqual([null, 47000, 42000]);
    expect(r.count).toBe(4);
  });

  it("caps returned rows but keeps full totals", () => {
    const r = runDefinition(rows, def({}), { today, limit: 2 });
    expect(r.sections[0].rows).toHaveLength(2);
    expect(r.totals[1]).toBe(47000);
    expect(r.truncated).toBe(true);
  });

  it("formats values for display", () => {
    expect(displayValue(fieldOf("gifts", "amount")!, 123450)).toBe("$1,234.50");
    expect(displayValue(fieldOf("gifts", "status")!, "partially_refunded")).toBe("Partially refunded");
    expect(displayValue(fieldOf("gifts", "gift_date")!, "2026-03-10")).toBe("03/10/2026");
    expect(displayValue(fieldOf("gifts", "offline")!, false)).toBe("No");
  });
});

describe("report definitions", () => {
  it("removes personal details for staff who can't view donors, and unknown fields", () => {
    const d = { ...defaultDefinition("gifts"), columns: ["gift_date", "email", "state", "nope"], groupBy: "donor_name", sort: [{ field: "phone", dir: "asc" as const }] };
    const { def: out, removed } = restrictDefinition(d, false);
    expect(out.columns).toEqual(["gift_date", "state"]);
    expect(out.groupBy).toBeNull();
    expect(out.sort).toEqual([]);
    expect(removed.sort()).toEqual(["Donor name", "Email", "Phone", "nope"].sort());
    expect(restrictDefinition(d, true).def.columns).toEqual(["gift_date", "email", "state"]);
  });

  it("validates saved definitions", () => {
    expect(definitionSchema.safeParse(defaultDefinition("donors")).success).toBe(true);
    expect(definitionSchema.safeParse({ ...defaultDefinition("donors"), columns: [] }).success).toBe(false);
  });
});

describe("donor giving in a date range", () => {
  // Rows as loadBuilderRows builds them for a 2025 range: net settled giving and gift count within the dates.
  const donors: Row[] = [
    { donor_name: "Ann Lee", lifetime_giving: 900000, period_giving: 500000, period_gift_count: 2 },
    { donor_name: "Bob Ray", lifetime_giving: 800000, period_giving: 499999, period_gift_count: 5 },
    { donor_name: "Cy Fox", lifetime_giving: 1200000, period_giving: 0, period_gift_count: 0 },
    { donor_name: "Di Kim", lifetime_giving: 600000, period_giving: 600000, period_gift_count: 1 },
  ];
  const in2025 = { field: "gift_date", op: "between", value: "2025-01-01", value2: "2025-12-31" };
  const d2025: ReportDefinition = {
    ...defaultDefinition("donors"), columns: ["donor_name", "period_giving", "period_gift_count"],
    filters: [in2025, { field: "period_giving", op: "gte", value: "5000" }], sort: [{ field: "period_giving", dir: "desc" }],
  };
  const names = (d: ReportDefinition) => runDefinition(donors, d, { today }).sections[0].rows.map((x) => x[0]);

  it("finds donors who gave $5,000 or more in the range, and totals what they gave", () => {
    const r = runDefinition(donors, d2025, { today });
    expect(r.sections[0].rows).toEqual([["Di Kim", 600000, 1], ["Ann Lee", 500000, 2]]);
    expect(r.totals).toEqual([null, 1100000, 3]);
  });

  it("a Gift date filter on its own keeps donors who gave in the range", () => {
    expect(names({ ...d2025, filters: [in2025] })).toEqual(["Di Kim", "Ann Lee", "Bob Ray"]);
  });

  it("names the dates in the column headings", () => {
    expect(runDefinition(donors, d2025, { today }).columns.map((c) => c.label)).toEqual(["Donor name", "Giving 01/01/2025–12/31/2025", "Gifts 01/01/2025–12/31/2025"]);
    const since = { ...d2025, filters: [{ field: "gift_date", op: "on_or_after", value: "2025-07-01" }] };
    expect(runDefinition(donors, since, { today }).columns[1].label).toBe("Giving since 07/01/2025");
  });

  it("takes the range from the Gift date filter, in any of its conditions", () => {
    const range = (f: { field: string; op: string; value?: string; value2?: string }) => resolvePeriod({ ...d2025, filters: [f] }, today);
    expect(range({ ...in2025, value: "2025-12-31", value2: "2025-01-01" })).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(range({ field: "gift_date", op: "last_year" })).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(range({ field: "gift_date", op: "this_year" })).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(range({ field: "gift_date", op: "last_days", value: "30" })).toEqual({ from: "2026-09-20", to: today });
    expect(range({ ...in2025, value2: "" })).toBeNull();
    // Two Gift date filters narrow the range.
    expect(resolvePeriod({ ...d2025, filters: [in2025, { field: "gift_date", op: "on_or_after", value: "2025-06-01" }] }, today)).toEqual({ from: "2025-06-01", to: "2025-12-31" });
    // Gift reports have no date range: Gift date filters gifts there.
    expect(resolvePeriod({ ...defaultDefinition("gifts"), filters: [in2025] }, today)).toBeNull();
  });

  it("asks for a Gift date filter when a date-range field is used without one", () => {
    expect(periodError(d2025)).toBeUndefined();
    expect(periodError({ ...d2025, filters: [] })).toMatch(/Gift date filter/);
    expect(periodError({ ...d2025, filters: [{ ...in2025, value: "" }] })).toMatch(/Gift date filter/);
    expect(periodError({ ...d2025, columns: ["donor_name"], filters: [], sort: [] })).toBeUndefined();
  });

  it("offers only range conditions for Gift date on donor reports", () => {
    expect(opsFor(fieldOf("donors", "gift_date")!).map((o) => o.value)).not.toContain("blank");
    expect(opsFor(fieldOf("gifts", "gift_date")!).map((o) => o.value)).toContain("blank");
    expect(restrictDefinition({ ...d2025, filters: [{ field: "gift_date", op: "blank" }] }, true).def.filters).toEqual([]);
  });
});
