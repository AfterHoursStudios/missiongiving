/** All amounts are integer cents. Never use floats for money. */
export function formatMoney(cents: number, currency = "USD", locale = "en-US") {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

export function dollarsToCents(input: string | number): number {
  const s = String(input).replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Invalid amount");
  const [d, c = ""] = s.split(".");
  return Number(d) * 100 + Number(c.padEnd(2, "0"));
}

export function validateDonationAmount(cents: number, min: number, max: number) {
  if (!Number.isInteger(cents)) return "Amount must be a whole number of cents";
  if (cents < min) return `Minimum donation is ${formatMoney(min)}`;
  if (cents > max) return `Maximum online donation is ${formatMoney(max)}`;
  return null;
}

export interface DonationLike {
  status: string;
  amount_cents: number;
  refunded_cents: number;
}
const SETTLED = new Set(["succeeded", "refunded", "partially_refunded"]);

/** Net settled giving for statements: settled amounts minus refunds. Pending/failed/disputed/canceled are excluded. */
export function netSettledCents(rows: DonationLike[]) {
  return rows.reduce(
    (sum, d) => (SETTLED.has(d.status) ? sum + d.amount_cents - d.refunded_cents : sum),
    0,
  );
}

/** Status after applying a cumulative refund total. */
export function statusAfterRefund(amount: number, refundedTotal: number) {
  if (refundedTotal < 0 || refundedTotal > amount) throw new Error("Refund exceeds donation amount");
  if (refundedTotal === 0) return "succeeded";
  return refundedTotal === amount ? "refunded" : "partially_refunded";
}

export function projectProgress(raisedCents: number, offlineAdjustmentCents: number, goalCents: number | null) {
  const raised = raisedCents + offlineAdjustmentCents;
  const pct = goalCents ? Math.min(100, Math.floor((raised / goalCents) * 100)) : null;
  return { raised, pct, goalReached: goalCents != null && raised >= goalCents };
}
