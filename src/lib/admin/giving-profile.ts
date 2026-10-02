import { SETTLED_STATUSES } from "@/lib/donations/status";

export interface ProfileGift { status: string; amount_cents: number; refunded_cents: number; donated_at: string }
export interface GiftPoint { cents: number; at: string }

export interface GivingProfile {
  /** Net settled giving per calendar year, newest first: [this year, last year, 2 years ago, ...]. */
  byYear: { year: number; cents: number }[];
  lifetimeCents: number;
  giftCount: number;
  yearsDonated: number;
  averageCents: number;
  first: GiftPoint | null;
  last: GiftPoint | null;
  largest: GiftPoint | null;
}

const SETTLED = new Set<string>(SETTLED_STATUSES);

/**
 * The donor's giving summary for the admin "Giving & engagement profile": settled gifts only, net of refunds,
 * counted in calendar years. `yearsBack` sets how many year buckets come back (this year included).
 */
export function givingProfile(gifts: ProfileGift[], now = new Date(), yearsBack = 6): GivingProfile {
  const settled = gifts.filter((g) => SETTLED.has(g.status)).map((g) => ({ cents: g.amount_cents - g.refunded_cents, gross: g.amount_cents, at: g.donated_at }));
  const thisYear = now.getFullYear();
  const totals = new Map<number, number>();
  for (const g of settled) { const y = new Date(g.at).getFullYear(); totals.set(y, (totals.get(y) ?? 0) + g.cents); }
  const byYear = Array.from({ length: yearsBack }, (_, i) => ({ year: thisYear - i, cents: totals.get(thisYear - i) ?? 0 }));

  const lifetimeCents = settled.reduce((s, g) => s + g.cents, 0);
  const byDate = [...settled].sort((a, b) => a.at.localeCompare(b.at));
  const point = (g?: { gross: number; at: string }) => (g ? { cents: g.gross, at: g.at } : null);
  const largest = settled.reduce<(typeof settled)[number] | undefined>((m, g) => (!m || g.gross > m.gross ? g : m), undefined);
  return {
    byYear, lifetimeCents, giftCount: settled.length,
    yearsDonated: [...totals.values()].filter((c) => c > 0).length,
    averageCents: settled.length ? Math.round(lifetimeCents / settled.length) : 0,
    first: point(byDate[0]), last: point(byDate[byDate.length - 1]), largest: point(largest),
  };
}
