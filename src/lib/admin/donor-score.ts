/**
 * Donor score (0–100): Recency 40% + Frequency 30% + Monetary 30%.
 *   Recency   = 100 × max(0, 1 − days_since_last_gift / 730). Uses the latest gift made here OR in DonorPerfect.
 *   Frequency = percentile rank of the donor's number of gifts in the last 24 months among donors who gave in that window.
 *   Monetary  = percentile rank of the donor's total given in the last 24 months, ranked the same way.
 *   donor_score = round(0.4 × recency + 0.3 × frequency + 0.3 × monetary)
 * Frequency and Monetary count only gifts made in this system (DonorPerfect history has no dated gifts). A donor with
 * nothing in the window scores 0 on both; among those who gave, the percentile is the share of givers at or below
 * them (ties share a rank, so the top giver(s) get 100).
 *
 * The live scores are computed in the database (view donor_scores, migration 0018). This is the reference
 * implementation of the same rules, kept in step with it and covered by tests.
 */
export const SCORE_WINDOW_DAYS = 730;
export const SCORE_WEIGHTS = { recency: 0.4, frequency: 0.3, monetary: 0.3 } as const;

export interface ScoreInput { id: string; gifts: { cents: number; at: Date }[]; dpLastGiftAt?: Date | null }
export interface DonorScore { recency: number; frequency: number; monetary: number; score: number; giftsInWindow: number; givenInWindowCents: number }

const DAY = 86_400_000;
const utcDay = (d: Date) => Math.floor(d.getTime() / DAY);

export function recencyScore(lastGift: Date | null, today: Date): number {
  if (!lastGift) return 0;
  const days = Math.max(0, utcDay(today) - utcDay(lastGift));
  return 100 * Math.max(0, 1 - days / SCORE_WINDOW_DAYS);
}

/** Percentile (0–100) of `value` among the positive values: share of them at or below it. Zero stays zero. */
export function percentileOf(value: number, positives: number[]): number {
  if (value <= 0 || positives.length === 0) return 0;
  return (positives.filter((v) => v <= value).length / positives.length) * 100;
}

export function computeDonorScores(donors: ScoreInput[], today = new Date()): Map<string, DonorScore> {
  const since = utcDay(today) - SCORE_WINDOW_DAYS;
  const rows = donors.map((d) => {
    const real = d.gifts.filter((g) => g.cents > 0);
    const inWindow = real.filter((g) => utcDay(g.at) >= since);
    const last = [...real.map((g) => g.at), ...(d.dpLastGiftAt ? [d.dpLastGiftAt] : [])].sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return { id: d.id, last, count: inWindow.length, cents: inWindow.reduce((s, g) => s + g.cents, 0) };
  });
  const counts = rows.map((r) => r.count).filter((n) => n > 0);
  const totals = rows.map((r) => r.cents).filter((n) => n > 0);
  return new Map(rows.map((r) => {
    const recency = recencyScore(r.last, today), frequency = percentileOf(r.count, counts), monetary = percentileOf(r.cents, totals);
    const score = Math.round(SCORE_WEIGHTS.recency * recency + SCORE_WEIGHTS.frequency * frequency + SCORE_WEIGHTS.monetary * monetary);
    return [r.id, { recency, frequency, monetary, score, giftsInWindow: r.count, givenInWindowCents: r.cents }];
  }));
}

/** DonorPerfect-style bands: High 70–100, Medium 40–69, Low 0–39. */
export function scoreTier(score: number | null | undefined): "high" | "medium" | "low" | null {
  if (score == null) return null;
  return score >= 70 ? "high" : score >= 40 ? "medium" : "low";
}
