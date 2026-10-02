import { describe, expect, it } from "vitest";
import { givingProfile } from "@/lib/admin/giving-profile";

const g = (amount: number, at: string, status = "succeeded", refunded = 0) => ({ amount_cents: amount, refunded_cents: refunded, status, donated_at: at });
const now = new Date("2026-09-30T12:00:00Z");

describe("givingProfile", () => {
  it("is empty for a donor with no gifts", () => {
    const p = givingProfile([], now);
    expect(p).toMatchObject({ lifetimeCents: 0, giftCount: 0, yearsDonated: 0, averageCents: 0, first: null, last: null, largest: null });
    expect(p.byYear.map((y) => y.year)).toEqual([2026, 2025, 2024, 2023, 2022, 2021]);
  });

  it("counts settled gifts net of refunds and ignores failed, pending and disputed ones", () => {
    const p = givingProfile([
      g(10000, "2026-03-01T00:00:00Z"),
      g(5000, "2026-04-01T00:00:00Z", "partially_refunded", 2000),
      g(9999, "2026-05-01T00:00:00Z", "failed"),
      g(9999, "2026-05-02T00:00:00Z", "pending"),
      g(9999, "2026-05-03T00:00:00Z", "disputed"),
      g(2500, "2024-12-31T00:00:00Z"),
    ], now);
    expect(p.lifetimeCents).toBe(15500);
    expect(p.giftCount).toBe(3);
    expect(p.byYear[0]).toEqual({ year: 2026, cents: 13000 });
    expect(p.byYear[1]).toEqual({ year: 2025, cents: 0 });
    expect(p.byYear[2]).toEqual({ year: 2024, cents: 2500 });
    expect(p.yearsDonated).toBe(2);
    expect(p.averageCents).toBe(5167);
  });

  it("finds the first, last and largest gift by gross amount", () => {
    const p = givingProfile([g(8500, "2026-09-03T00:00:00Z"), g(258500, "2022-12-31T00:00:00Z"), g(8500, "2022-01-31T00:00:00Z")], now);
    expect(p.first).toEqual({ cents: 8500, at: "2022-01-31T00:00:00Z" });
    expect(p.last).toEqual({ cents: 8500, at: "2026-09-03T00:00:00Z" });
    expect(p.largest).toEqual({ cents: 258500, at: "2022-12-31T00:00:00Z" });
  });

  it("does not count a fully refunded year as a year donated", () => {
    expect(givingProfile([g(5000, "2025-06-01T00:00:00Z", "refunded", 5000)], now).yearsDonated).toBe(0);
  });
});
