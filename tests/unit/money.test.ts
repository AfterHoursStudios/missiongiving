import { describe, expect, it } from "vitest";
import {
  dollarsToCents, formatMoney, netSettledCents, projectProgress, statusAfterRefund, validateDonationAmount,
} from "@/lib/money";

describe("dollarsToCents", () => {
  it("converts without float error", () => {
    expect(dollarsToCents("19.99")).toBe(1999);
    expect(dollarsToCents("$1,250.5")).toBe(125050);
    expect(dollarsToCents(10)).toBe(1000);
  });
  it("rejects bad input", () => {
    for (const bad of ["", "-5", "1.234", "abc", "1e3"]) expect(() => dollarsToCents(bad)).toThrow();
  });
});

describe("validateDonationAmount", () => {
  it("enforces min and max", () => {
    expect(validateDonationAmount(400, 500, 100000)).toMatch(/Minimum/);
    expect(validateDonationAmount(100001, 500, 100000)).toMatch(/Maximum/);
    expect(validateDonationAmount(500, 500, 100000)).toBeNull();
    expect(validateDonationAmount(5.5, 500, 100000)).toMatch(/whole/);
  });
});

describe("refund calculations", () => {
  it("derives status from cumulative refunds", () => {
    expect(statusAfterRefund(5000, 0)).toBe("succeeded");
    expect(statusAfterRefund(5000, 1500)).toBe("partially_refunded");
    expect(statusAfterRefund(5000, 5000)).toBe("refunded");
  });
  it("rejects over-refund", () => {
    expect(() => statusAfterRefund(5000, 5001)).toThrow();
  });
});

describe("annual statement totals", () => {
  it("counts only settled gifts minus refunds", () => {
    const rows = [
      { status: "succeeded", amount_cents: 5000, refunded_cents: 0 },
      { status: "partially_refunded", amount_cents: 10000, refunded_cents: 4000 },
      { status: "refunded", amount_cents: 2500, refunded_cents: 2500 },
      { status: "pending", amount_cents: 9999, refunded_cents: 0 },   // ACH not settled
      { status: "failed", amount_cents: 9999, refunded_cents: 0 },
      { status: "disputed", amount_cents: 9999, refunded_cents: 0 },
      { status: "canceled", amount_cents: 9999, refunded_cents: 0 },
    ];
    expect(netSettledCents(rows)).toBe(11000);
  });
});

describe("projectProgress", () => {
  it("includes offline adjustments and caps percent", () => {
    expect(projectProgress(50000, 10000, 100000)).toEqual({ raised: 60000, pct: 60, goalReached: false });
    expect(projectProgress(120000, 0, 100000)).toEqual({ raised: 120000, pct: 100, goalReached: true });
    expect(projectProgress(100, 0, null).pct).toBeNull();
  });
});

it("formats money", () => expect(formatMoney(12345)).toBe("$123.45"));
