import { describe, expect, it } from "vitest";
import { SAMPLE_EMAIL_PATTERN, generateSample } from "../../scripts/sample-data";

const NOW = new Date("2026-06-15T12:00:00Z");

describe("sample data generator", () => {
  const a = generateSample(NOW), b = generateSample(NOW);
  it("is deterministic", () => expect(b).toEqual(a));
  it("is unmistakably fake", () => {
    for (const d of a.donors) {
      expect(d.email).toMatch(/^sample-\d+@example\.test$/);
      expect(d.first_name).toMatch(/^\[SAMPLE\]/);
    }
    expect(SAMPLE_EMAIL_PATTERN).toBe("sample-%@example.test");
    for (const e of a.expenses) expect(e.vendor).toMatch(/^\[SAMPLE\]/);
  });
  it("produces internally consistent donations", () => {
    expect(a.donations.length).toBeGreaterThan(20);
    for (const d of a.donations) {
      expect(d.refunded_cents).toBeGreaterThanOrEqual(0);
      expect(d.refunded_cents).toBeLessThanOrEqual(d.amount_cents);
      expect(new Date(d.donated_at).getTime()).toBeLessThanOrEqual(NOW.getTime());
      const settled = ["succeeded", "partially_refunded", "refunded", "disputed"].includes(d.status);
      expect(d.settled_at !== null, d.status).toBe(settled);
      if (!settled) expect(d.fee_cents).toBe(0);
      if (d.status === "refunded") expect(d.refunded_cents).toBe(d.amount_cents);
      if (d.status === "partially_refunded") expect(d.refunded_cents).toBeGreaterThan(0);
      expect(d.donorIndex).toBeLessThan(a.donors.length);
    }
  });
  it("covers the interesting states so reports and reconciliation have something to show", () => {
    const seen = new Set(a.donations.map((d) => d.status));
    for (const s of ["succeeded", "failed"]) expect(seen.has(s as never), s).toBe(true);
    expect(new Set(a.donations.map((d) => d.payment_method)).size).toBe(2);
  });
});
