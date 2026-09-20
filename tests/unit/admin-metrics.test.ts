import { describe, expect, it } from "vitest";
import { buildSeries, computeKpis, defaultRange, parseRange, type DonationRec, type RecurringRec } from "@/lib/admin/metrics";
import { csvCell, toCsv } from "@/lib/csv";
import { findDuplicateGroups, normalizeEmail } from "@/lib/admin/duplicates";

const TZ = "America/Los_Angeles";
const NOW = new Date("2026-06-15T19:00:00Z");
let n = 0;
const don = (over: Partial<DonationRec>): DonationRec => ({
  id: `d${++n}`, donor_id: "a", amount_cents: 5000, refunded_cents: 0, status: "succeeded", frequency: "one_time",
  payment_method: "card", designation: "General Fund", tier_title: "$50", settled_at: "2026-06-15T18:00:00Z", donated_at: "2026-06-15T18:00:00Z", ...over,
});

describe("computeKpis", () => {
  const rows = [
    don({}),                                                                                     // today
    don({ settled_at: "2026-06-14T18:00:00Z", amount_cents: 2000 }),                             // yesterday, this month
    don({ settled_at: "2026-05-10T18:00:00Z", amount_cents: 4000, donor_id: "b" }),              // last month
    don({ status: "partially_refunded", amount_cents: 10000, refunded_cents: 3000, settled_at: "2026-06-02T18:00:00Z", donor_id: "b" }),
    don({ status: "pending", payment_method: "us_bank_account", amount_cents: 9900, settled_at: null, donor_id: "c" }),
    don({ status: "failed", amount_cents: 7777 }),
    don({ settled_at: "2025-03-01T18:00:00Z", amount_cents: 1000, donor_id: "z" }),              // last year
  ];
  const rec: RecurringRec[] = [
    { donor_id: "a", amount_cents: 2500, frequency: "monthly", status: "active" },
    { donor_id: "b", amount_cents: 12000, frequency: "yearly", status: "active" },
    { donor_id: "c", amount_cents: 1000, frequency: "monthly", status: "past_due" },
    { donor_id: "d", amount_cents: 1000, frequency: "monthly", status: "canceled" },
  ];
  const k = computeKpis(rows, rec, NOW, TZ);

  it("nets refunds and ignores unsettled money", () => {
    expect(k.today).toMatchObject({ current: 5000, previous: 2000, changePct: 150 });
    expect(k.month.current).toBe(5000 + 2000 + 7000);
    expect(k.month.previous).toBe(4000);
    expect(k.year.current).toBe(5000 + 2000 + 4000 + 7000);
    expect(k.year.previous).toBe(1000);
  });
  it("summarizes recurring value and problems", () => {
    expect(k.activeRecurringDonors).toBe(2);
    expect(k.monthlyRecurringCents).toBe(2500);
    expect(k.yearlyRecurringCents).toBe(12000);
    expect(k.pastDueRecurring).toBe(1);
    expect(k.pendingAch).toEqual({ count: 1, cents: 9900 });
  });
  it("splits new vs returning donors this month", () => {
    expect(k.newDonorsThisMonth).toBe(1);      // a: first gift this month
    expect(k.returningDonorsThisMonth).toBe(1); // b: first gift was May
  });
  it("returns null change when there is no prior period", () => {
    expect(computeKpis([don({})], [], NOW, TZ).year.changePct).toBeNull();
  });
});

describe("series", () => {
  const range = parseRange("2026-04-01", "2026-06-30", defaultRange(NOW, TZ));
  const input = (donations: DonationRec[]) => ({ donations, expenses: [], projects: [], tz: TZ, range });

  it("buckets revenue by month including empty months", () => {
    const t = buildSeries("revenue", input([don({ settled_at: "2026-04-10T18:00:00Z" }), don({ settled_at: "2026-06-10T18:00:00Z", amount_cents: 2500 })]));
    expect(t.rows).toEqual([["2026-04", 50, 1], ["2026-05", 0, 0], ["2026-06", 25, 1]]);
  });
  it("excludes gifts outside the selected range", () => {
    const t = buildSeries("by-designation", input([don({ settled_at: "2026-01-10T18:00:00Z" })]));
    expect(t.rows).toEqual([]);
  });
  it("groups custom amounts and computes retention", () => {
    const t = buildSeries("tiers", input([don({ tier_title: null }), don({})]));
    expect(t.rows.map((r) => r[0]).sort()).toEqual(["$50", "Custom amount"]);
    const r = buildSeries("retention", input([
      don({ donor_id: "a", settled_at: "2024-05-01T18:00:00Z" }), don({ donor_id: "b", settled_at: "2024-05-01T18:00:00Z" }),
      don({ donor_id: "a", settled_at: "2025-05-01T18:00:00Z" }),
    ]));
    expect(r.rows).toEqual([["2025", 2, 1, 50]]);
  });
  it("computes net operating result from approved expenses only", () => {
    const t = buildSeries("revenue-expenses", { ...input([don({ settled_at: "2026-06-10T18:00:00Z" })]),
      expenses: [{ expense_date: "2026-06-05", amount_cents: 1500, approval: "approved" }, { expense_date: "2026-06-06", amount_cents: 9999, approval: "pending" }] });
    expect(t.rows.at(-1)).toEqual(["2026-06", 50, 15, 35]);
  });
  it("falls back on an invalid or inverted range", () => {
    const fb = defaultRange(NOW, TZ);
    expect(parseRange("2026-06-30", "2026-01-01", fb)).toEqual(fb);
    expect(parseRange("nope", undefined, fb)).toEqual(fb);
  });
});

describe("csv", () => {
  it("neutralizes spreadsheet formulas and escapes quotes", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell(-5)).toBe("-5"); // real numbers are untouched
    expect(toCsv(["a", "b"], [[1, "x\ny"]])).toBe('a,b\r\n1,"x\ny"\r\n');
  });
});

describe("duplicate detection", () => {
  const c = (id: string, over: object) => ({ id, first_name: "Ann", last_name: "Lee", email: `${id}@x.test`, phone: null, postal_code: null, created_at: "2026-01-01", ...over });
  it("normalizes gmail dots and plus tags only", () => {
    expect(normalizeEmail(" A.N.n+news@Gmail.com ")).toBe("ann@gmail.com");
    expect(normalizeEmail("a.b@corp.com")).toBe("a.b@corp.com");
  });
  it("groups by email, phone and name+postal, never by name alone", () => {
    const g = findDuplicateGroups([
      c("1", { email: "Ann@Gmail.com" }), c("2", { email: "a.nn+x@gmail.com" }),
      c("3", { phone: "(555) 123-4567" }), c("4", { phone: "555.123.4567", first_name: "Bob" }),
      c("5", { postal_code: "97027" }), c("6", { postal_code: "97027" }),
      c("7", {}), c("8", { last_name: "Lee", first_name: "Ann" }),
    ]);
    const reasons = g.map((x) => `${x.reason}:${x.donors.map((d) => d.id).join("")}`).sort();
    expect(reasons).toEqual(["email:12", "name_postal:56", "phone:34"]);
  });
});
