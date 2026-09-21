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
