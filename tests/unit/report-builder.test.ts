import { describe, expect, it } from "vitest";
import { displayValue, runDefinition, type Row } from "@/lib/reports/builder/engine";
import { defaultDefinition, definitionSchema, fieldOf, restrictDefinition, type ReportDefinition } from "@/lib/reports/builder/fields";

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
