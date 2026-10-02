import { describe, expect, it } from "vitest";
import { computeDonorScores, percentileOf, recencyScore, scoreTier } from "@/lib/admin/donor-score";

const today = new Date("2026-10-01T12:00:00Z");
const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000);
const gift = (cents: number, days: number) => ({ cents, at: daysAgo(days) });

describe("recencyScore", () => {
  it("is 100 today, falls linearly, and is 0 from two years on", () => {
    expect(recencyScore(daysAgo(0), today)).toBe(100);
    expect(recencyScore(daysAgo(365), today)).toBe(50);
    expect(recencyScore(daysAgo(730), today)).toBe(0);
    expect(recencyScore(daysAgo(1000), today)).toBe(0);
    expect(recencyScore(null, today)).toBe(0);
  });
});

describe("percentileOf", () => {
  it("is the share of givers at or below the value; zero stays zero", () => {
    expect(percentileOf(5, [1, 2, 5, 10])).toBe(75);
    expect(percentileOf(10, [1, 2, 5, 10])).toBe(100);
    expect(percentileOf(2, [2, 2, 5, 10])).toBe(50); // ties share a rank
    expect(percentileOf(0, [1, 2])).toBe(0);
  });
});

describe("computeDonorScores", () => {
  const scores = computeDonorScores([
    { id: "top", gifts: [gift(10000, 3), gift(10000, 40), gift(10000, 70), gift(10000, 100)] },     // most gifts, most money, recent
    { id: "mid", gifts: [gift(5000, 30), gift(5000, 400)] },
    { id: "old", gifts: [gift(90000, 800)] },                                                          // outside the window
    { id: "dp", gifts: [], dpLastGiftAt: daysAgo(73) },                                                // DonorPerfect history only
    { id: "refunded", gifts: [gift(0, 5)] },                                                           // fully refunded: not a gift
  ], today);

  it("scores the strongest recent donor highest", () => {
    const s = scores.get("top")!;
    expect(s.recency).toBeCloseTo(100 * (1 - 3 / 730));
    expect(s.frequency).toBe(100);
    expect(s.monetary).toBe(100);
    expect(s.score).toBe(Math.round(0.4 * s.recency + 30 + 30)); // 100
    expect(s.giftsInWindow).toBe(4);
    expect(s.givenInWindowCents).toBe(40000);
  });

  it("ranks frequency and monetary only among donors who gave in the last 24 months", () => {
    const m = scores.get("mid")!;
    expect(m.frequency).toBe(50); // 2 gifts vs [4, 2] → half of givers at or below
    expect(m.monetary).toBe(50);
    expect(m.score).toBe(Math.round(0.4 * (100 * (1 - 30 / 730)) + 0.3 * 50 + 0.3 * 50));
  });

  it("gives an old donor nothing for recency, frequency or money", () => {
    expect(scores.get("old")).toMatchObject({ recency: 0, frequency: 0, monetary: 0, score: 0 });
  });

  it("uses a DonorPerfect last gift for recency only", () => {
    expect(scores.get("dp")).toMatchObject({ recency: 90, frequency: 0, monetary: 0, score: 36 });
  });

  it("ignores fully refunded gifts", () => {
    expect(scores.get("refunded")).toMatchObject({ score: 0, giftsInWindow: 0 });
  });
});

describe("scoreTier", () => {
  it("bands like DonorPerfect", () => {
    expect([scoreTier(100), scoreTier(70), scoreTier(69), scoreTier(40), scoreTier(39), scoreTier(null)]).toEqual(["high", "high", "medium", "medium", "low", null]);
  });
});
