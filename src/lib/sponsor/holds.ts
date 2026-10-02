const PENDING_HOLD_MS = 48 * 60 * 60 * 1000;

/**
 * Does a recurring gift mean "this woman has a sponsor"? Active and past-due gifts do (a failed renewal is still her sponsor).
 * A gift still awaiting its first payment holds her for 48 hours so two people can't sponsor her at once, but a stale, never-paid
 * attempt must not keep her hidden forever. Canceled, paused and completed gifts release her.
 */
export function holdsSponsorship(status: string, createdAt: string, now = Date.now()): boolean {
  if (status === "active" || status === "past_due") return true;
  if (status === "incomplete") return now - new Date(createdAt).getTime() < PENDING_HOLD_MS;
  return false;
}

/** What is still unfunded per month on a sponsorship once partial and full monthly sponsors are counted. Never negative. */
export function remainingCents(monthlyAmountCents: number, heldCents: number): number {
  return Math.max(0, monthlyAmountCents - heldCents);
}

const COUNTED_GIFT = ["succeeded", "partially_refunded", "refunded", "pending", "processing"];

/**
 * Which sponsored women a donor should see as theirs (their Sponsored worker page and "Sponsor" badge), keyed by her
 * backing project: the monthly amount they give now, or null for a one-time gift. A live monthly gift counts (same rule as
 * holdsSponsorship). Once a monthly sponsorship ends (canceled, completed, paused) she is no longer theirs, even though
 * their past payments to her remain. One-time givers who never sponsored her monthly still see her, as a thank-you.
 */
export function donorSponsorships(
  gifts: { project_id: string | null; status: string }[],
  recurring: { project_id: string | null; status: string; amount_cents: number; created_at: string }[],
  sponsorshipProjects: Set<string>, now = Date.now(),
): Map<string, number | null> {
  const mine = new Map<string, number | null>();
  const hadMonthly = new Set<string>();
  for (const r of recurring) {
    if (!r.project_id || !sponsorshipProjects.has(r.project_id)) continue;
    hadMonthly.add(r.project_id);
    if (holdsSponsorship(r.status, r.created_at, now)) mine.set(r.project_id, (mine.get(r.project_id) ?? 0) + Number(r.amount_cents));
  }
  for (const g of gifts) {
    if (!g.project_id || !sponsorshipProjects.has(g.project_id) || hadMonthly.has(g.project_id) || !COUNTED_GIFT.includes(g.status)) continue;
    if (!mine.has(g.project_id)) mine.set(g.project_id, null);
  }
  return mine;
}
