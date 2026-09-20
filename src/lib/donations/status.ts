export type DonationStatus =
  | "pending" | "processing" | "succeeded" | "failed" | "refunded"
  | "partially_refunded" | "disputed" | "canceled";

/**
 * Stripe events can arrive out of order or be redelivered. A status may only move "forward":
 * a late `processing` event must never overwrite `succeeded`, and a redelivered `failed` must not
 * overwrite a refund. Refund/dispute states are derived separately (see handlers), not through this rank.
 */
const RANK: Record<DonationStatus, number> = {
  pending: 0,
  processing: 1,
  failed: 2,
  canceled: 2,
  succeeded: 3,
  partially_refunded: 4,
  refunded: 5,
  disputed: 6,
};

export function advanceStatus(current: DonationStatus, incoming: DonationStatus): DonationStatus {
  // A delayed ACH failure is legitimate after `processing`, and a retried payment can succeed after `failed`.
  if (current === "failed" && (incoming === "succeeded" || incoming === "processing")) return incoming;
  return RANK[incoming] > RANK[current] ? incoming : current;
}

/** Only these states count as settled money (statements, project totals, revenue). */
export const SETTLED_STATUSES: readonly DonationStatus[] = ["succeeded", "partially_refunded", "refunded"];

export const STATUS_LABELS: Record<DonationStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  succeeded: "Succeeded",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  disputed: "Disputed",
  canceled: "Canceled",
};

/** A final tax receipt may only be issued once funds are confirmed. ACH stays "Payment Pending" until then. */
export function isReceiptFinal(status: DonationStatus) {
  return SETTLED_STATUSES.includes(status) || status === "disputed";
}
