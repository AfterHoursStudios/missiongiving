import { describe, expect, it } from "vitest";
import { PAGE_SIZE, filterContributions, type ContributionRow } from "@/lib/donor/contributions";

const row = (i: number, over: Partial<ContributionRow> = {}): ContributionRow => ({
  id: `r${i}`, donated_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, amount_cents: 1000, payment_method: "card",
  frequency: "one_time", status: "succeeded", designation: "General Fund", receipt_number: `MG-${1000 + i}`, ...over,
});
const year = (iso: string) => Number(iso.slice(0, 4));

describe("filterContributions", () => {
  const rows = [
    row(1), row(2, { status: "pending", payment_method: "us_bank_account" }),
    row(3, { designation: "Clean Water Project", frequency: "monthly" }), row(4, { donated_at: "2025-06-01T00:00:00Z" }),
  ];
  it("filters by status, frequency and year", () => {
    expect(filterContributions(rows, { status: "pending" }, year).rows.map((r) => r.id)).toEqual(["r2"]);
    expect(filterContributions(rows, { frequency: "monthly" }, year).rows.map((r) => r.id)).toEqual(["r3"]);
    expect(filterContributions(rows, { year: 2025 }, year).rows.map((r) => r.id)).toEqual(["r4"]);
  });
  it("searches designation and receipt number case-insensitively", () => {
    expect(filterContributions(rows, { q: "WATER" }, year).total).toBe(1);
    expect(filterContributions(rows, { q: "mg-1002" }, year).rows[0].id).toBe("r2");
    expect(filterContributions(rows, { q: "nomatch" }, year).total).toBe(0);
  });
  it("paginates and clamps out-of-range pages", () => {
    const many = Array.from({ length: PAGE_SIZE * 2 + 1 }, (_, i) => row(i));
    const r = filterContributions(many, { page: 99 }, year);
    expect(r.pages).toBe(3);
    expect(r.page).toBe(3);
    expect(r.rows).toHaveLength(1);
    expect(filterContributions([], {}, year)).toMatchObject({ total: 0, pages: 1, page: 1 });
  });
});
