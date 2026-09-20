export interface ReconDonation {
  id: string; donor_id: string; donor_name: string; amount_cents: number; refunded_cents: number; status: string; payment_method: string;
  frequency: string; donated_at: string; settled_at: string | null; has_final_receipt: boolean;
}
export interface ReconRecurring { id: string; donor_id: string; donor_name: string; status: string; amount_cents: number; created_at: string }
export interface ReconEvent { stripe_event_id: string; type: string; status: string; attempts: number; error: string | null; received_at: string }

export interface AttentionItem { key: string; label: string; detail: string; donorId?: string; eventId?: string }
export interface AttentionGroup { id: string; title: string; explanation: string; items: AttentionItem[] }

const H = 3_600_000, D = 24 * H;

/**
 * Records that need a human. Thresholds are deliberately conservative: card payments resolve in seconds, while ACH
 * legitimately stays pending for days, so only pendings well beyond the normal window are flagged.
 */
export function classifyAttention(
  donations: ReconDonation[], recurring: ReconRecurring[], events: ReconEvent[], now: Date,
): AttentionGroup[] {
  const age = (iso: string) => now.getTime() - new Date(iso).getTime();
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const label = (d: ReconDonation) => `${d.donor_name} · ${money(d.amount_cents)} · ${d.payment_method === "us_bank_account" ? "ACH" : d.payment_method}`;
  const groups: AttentionGroup[] = [];
  const add = (id: string, title: string, explanation: string, items: AttentionItem[]) => { if (items.length) groups.push({ id, title, explanation, items }); };

  add("stuck", "Payments pending too long",
    "Card payments pending over 1 hour, or bank (ACH) payments pending over 7 days. Check Stripe; a webhook may have been missed.",
    donations.filter((d) => ["pending", "processing"].includes(d.status) && age(d.donated_at) > (d.payment_method === "us_bank_account" ? 7 * D : H))
      .map((d) => ({ key: d.id, label: label(d), detail: `${d.status} since ${d.donated_at.slice(0, 10)}`, donorId: d.donor_id })));

  add("failed", "Failed payments in the last 30 days", "For follow-up. Donors were notified automatically.",
    donations.filter((d) => d.status === "failed" && age(d.donated_at) < 30 * D).map((d) => ({ key: d.id, label: label(d), detail: d.donated_at.slice(0, 10), donorId: d.donor_id })));

  add("disputed", "Open disputes", "Respond in the Stripe dashboard within the deadline. Disputed gifts are excluded from revenue.",
    donations.filter((d) => d.status === "disputed").map((d) => ({ key: d.id, label: label(d), detail: d.donated_at.slice(0, 10), donorId: d.donor_id })));

  add("no-receipt", "Settled gifts without a final receipt", "A receipt should exist for every settled gift. Use Resend receipt on the donor page after checking the record.",
    donations.filter((d) => ["succeeded", "partially_refunded", "refunded"].includes(d.status) && !d.has_final_receipt)
      .map((d) => ({ key: d.id, label: label(d), detail: `settled ${(d.settled_at ?? d.donated_at).slice(0, 10)}`, donorId: d.donor_id })));

  add("refund-mismatch", "Refund amounts inconsistent with status", "The refunded amount and the status disagree. Compare with Stripe.",
    donations.filter((d) => (d.status === "succeeded" && d.refunded_cents > 0) || (d.status === "refunded" && d.refunded_cents !== d.amount_cents) || (d.status === "partially_refunded" && (d.refunded_cents <= 0 || d.refunded_cents >= d.amount_cents)))
      .map((d) => ({ key: d.id, label: label(d), detail: `status ${d.status}, refunded ${money(d.refunded_cents)}`, donorId: d.donor_id })));

  add("recurring-incomplete", "Recurring gifts never completed", "A subscription was created over a day ago but its first payment never confirmed.",
    recurring.filter((r) => r.status === "incomplete" && age(r.created_at) > D).map((r) => ({ key: r.id, label: `${r.donor_name} · ${money(r.amount_cents)}`, detail: `started ${r.created_at.slice(0, 10)}`, donorId: r.donor_id })));

  add("recurring-past-due", "Recurring gifts past due", "The latest renewal payment failed. Stripe retries automatically; donors can update their payment method.",
    recurring.filter((r) => r.status === "past_due").map((r) => ({ key: r.id, label: `${r.donor_name} · ${money(r.amount_cents)}`, detail: "past due", donorId: r.donor_id })));

  add("webhooks", "Webhook events that failed or stalled", "Failed events are retried by Stripe; use Retry to reprocess safely (processing is idempotent).",
    events.filter((e) => e.status === "failed" || (e.status === "received" && age(e.received_at) > 15 * 60_000))
      .map((e) => ({ key: e.stripe_event_id, eventId: e.stripe_event_id, label: `${e.type} (${e.stripe_event_id})`, detail: `${e.status}, ${e.attempts} attempt${e.attempts === 1 ? "" : "s"}${e.error ? ` · ${e.error}` : ""}` })));

  return groups;
}
