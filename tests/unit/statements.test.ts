import { describe, expect, it } from "vitest";
import { buildStatement, statementYears, yearInZone, type StatementDonation } from "@/lib/statements";
import { renderStatementPdf } from "@/lib/statements-pdf";

const TZ = "America/Los_Angeles";
const d = (over: Partial<StatementDonation>): StatementDonation => ({
  id: "x", status: "succeeded", amount_cents: 5000, refunded_cents: 0,
  donated_at: "2026-03-01T12:00:00Z", settled_at: "2026-03-01T12:00:00Z", designation: "General Fund", ...over,
});

describe("yearInZone", () => {
  it("uses the org time zone at year boundaries", () => {
    expect(yearInZone("2027-01-01T03:00:00Z", TZ)).toBe(2026); // still Dec 31 in Pacific time
    expect(yearInZone("2027-01-01T09:00:00Z", TZ)).toBe(2027);
  });
});

describe("buildStatement", () => {
  it("includes only settled gifts, net of refunds", () => {
    const s = buildStatement([
      d({ id: "a" }),
      d({ id: "b", status: "partially_refunded", amount_cents: 10000, refunded_cents: 4000 }),
      d({ id: "c", status: "refunded", amount_cents: 2500, refunded_cents: 2500 }),
      d({ id: "p", status: "pending", settled_at: null }),
      d({ id: "f", status: "failed" }), d({ id: "x", status: "disputed" }), d({ id: "k", status: "canceled" }),
    ], 2026, TZ);
    expect(s.lines.map((l) => l.id)).toEqual(["a", "b"]);
    expect(s.totalCents).toBe(11000);
  });
  it("assigns an ACH gift to the year it settled, not the year it started", () => {
    const ach = d({ donated_at: "2026-12-30T20:00:00Z", settled_at: "2027-01-05T20:00:00Z" });
    expect(buildStatement([ach], 2026, TZ).lines).toHaveLength(0);
    expect(buildStatement([ach], 2027, TZ).totalCents).toBe(5000);
  });
  it("lists years with settled gifts only, newest first", () => {
    const rows = [d({ settled_at: "2024-05-01T00:00:00Z" }), d({}), d({ status: "pending", settled_at: null, donated_at: "2030-01-01T00:00:00Z" })];
    expect(statementYears(rows, TZ)).toEqual([2026, 2024]);
  });
  it("renders a PDF", async () => {
    const s = buildStatement([d({ receipt_number: "MG-1" })], 2026, TZ);
    const buf = await renderStatementPdf(s, "Sample Donor", "USD", { legalName: "Org", address: "", ein: "", phone: "", acknowledgment: "", noGoods: "" }, TZ);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
