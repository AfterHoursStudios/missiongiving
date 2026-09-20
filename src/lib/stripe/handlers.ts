import type Stripe from "stripe";
import { statusAfterRefund } from "@/lib/money";
import type { DonationsRepo, DonationRow } from "@/lib/donations/repo";
import { advanceStatus, isReceiptFinal, type DonationStatus } from "@/lib/donations/status";

export type NotifyKind =
  | "donation_success" | "ach_confirmed" | "payment_failed" | "recurring_canceled" | "refund_issued";

export interface HandlerDeps {
  repo: DonationsRepo;
  /** Best-effort email; failures must not fail payment reconciliation. */
  notify(kind: NotifyKind, ref: { donationId?: string; recurringId?: string }): Promise<void>;
  /** Stripe lookups isolated here so handlers stay pure/testable. */
  lookupInvoicePayment(invoiceId: string): Promise<{ paymentIntent: string | null; method: "card" | "us_bank_account" }>;
  lookupChargeFee(chargeId: string): Promise<number>;
}

export type HandlerResult = "processed" | "ignored";

const SUB_STATUS: Record<string, string> = {
  active: "active", trialing: "active", past_due: "past_due", unpaid: "past_due",
  canceled: "canceled", paused: "paused", incomplete: "incomplete", incomplete_expired: "canceled",
};

const id = (x: string | { id: string } | null | undefined) => (typeof x === "string" ? x : x?.id ?? null);

function invoiceSubscription(invoice: Stripe.Invoice): string | null {
  return id(invoice.parent?.subscription_details?.subscription as string | { id: string } | null | undefined);
}

async function safeNotify(deps: HandlerDeps, kind: NotifyKind, ref: { donationId?: string; recurringId?: string }) {
  try { await deps.notify(kind, ref); } catch { /* logged by notifier; never block reconciliation */ }
}

async function markSucceeded(deps: HandlerDeps, d: DonationRow, extra: { charge?: string | null }) {
  const next = advanceStatus(d.status, "succeeded");
  const firstTime = d.status !== "succeeded" && next === "succeeded";
  let fee: number | undefined;
  if (extra.charge && firstTime) { try { fee = await deps.lookupChargeFee(extra.charge); } catch { fee = undefined; } }
  await deps.repo.updateDonation(d.id, {
    status: next,
    ...(firstTime ? { settled_at: new Date().toISOString() } : {}),
    ...(extra.charge ? { stripe_charge_id: extra.charge } : {}),
    ...(fee !== undefined ? { fee_cents: fee } : {}),
  });
  await deps.repo.ensureReceipt(d.id, isReceiptFinal(next));
  if (firstTime) await safeNotify(deps, d.payment_method === "us_bank_account" ? "ach_confirmed" : "donation_success", { donationId: d.id });
}

export async function handleStripeEvent(event: Stripe.Event, deps: HandlerDeps): Promise<HandlerResult> {
  const { repo } = deps;

  switch (event.type) {
    case "payment_intent.processing": {
      const pi = event.data.object;
      const d = await repo.findDonationByPaymentIntent(pi.id);
      if (!d) return "ignored";
      const next = advanceStatus(d.status, "processing");
      if (next !== d.status) await repo.updateDonation(d.id, { status: next });
      await repo.ensureReceipt(d.id, false); // pending acknowledgment only
      return "processed";
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object;
      const d = await repo.findDonationByPaymentIntent(pi.id);
      if (!d) return "ignored"; // subscription payments are reconciled via invoice.paid
      await markSucceeded(deps, d, { charge: id(pi.latest_charge as string | { id: string } | null) });
      return "processed";
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      const d = await repo.findDonationByPaymentIntent(pi.id);
      if (!d) return "ignored";
      const next = advanceStatus(d.status, "failed");
      if (next === "failed" && d.status !== "failed") {
        await repo.updateDonation(d.id, { status: "failed" });
        await safeNotify(deps, "payment_failed", { donationId: d.id });
      }
      return "processed";
    }
    case "payment_intent.canceled": {
      const d = await repo.findDonationByPaymentIntent(event.data.object.id);
      if (!d) return "ignored";
      const next = advanceStatus(d.status, "canceled");
      if (next !== d.status) await repo.updateDonation(d.id, { status: "canceled" });
      return "processed";
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const pi = id(charge.payment_intent as string | { id: string } | null);
      const d = pi ? await repo.findDonationByPaymentIntent(pi) : null;
      if (!d) return "ignored";
      const total = Math.min(charge.amount_refunded, d.amount_cents);
      if (total <= d.refunded_cents) return "processed"; // redelivery / stale event
      await repo.updateDonation(d.id, { refunded_cents: total, status: statusAfterRefund(d.amount_cents, total) as DonationStatus });
      await safeNotify(deps, "refund_issued", { donationId: d.id });
      return "processed";
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      const dispute = event.data.object;
      const pi = id(dispute.payment_intent as string | { id: string } | null);
      const d = pi ? await repo.findDonationByPaymentIntent(pi) : null;
      if (!d) return "ignored";
      await repo.upsertDispute({
        donationId: d.id, stripeDisputeId: dispute.id, amount_cents: dispute.amount,
        status: dispute.status, reason: dispute.reason ?? null,
      });
      if (event.type === "charge.dispute.closed" && dispute.status === "won") {
        const restored = d.refunded_cents === 0 ? "succeeded" : statusAfterRefund(d.amount_cents, d.refunded_cents);
        await repo.updateDonation(d.id, { status: restored as DonationStatus });
      } else if (d.status !== "disputed") {
        await repo.updateDonation(d.id, { status: "disputed" });
      }
      return "processed";
    }
    case "invoice.paid": {
      const invoice = event.data.object;
      const sub = invoiceSubscription(invoice);
      const recurring = sub ? await repo.findRecurringBySubscription(sub) : null;
      if (!invoice.id || !recurring) return "ignored";
      const pay = await deps.lookupInvoicePayment(invoice.id);
      let d = await repo.findDonationByInvoice(invoice.id);
      if (!d) {
        d = await repo.createDonationFromInvoice({
          recurring, invoice: invoice.id, paymentIntent: pay.paymentIntent,
          amount_cents: invoice.amount_paid, status: "pending", paymentMethod: pay.method, settled: false,
        });
      } else if (pay.paymentIntent && !d.stripe_payment_intent_id) {
        await repo.updateDonation(d.id, { stripe_payment_intent_id: pay.paymentIntent, payment_method: pay.method });
        d = { ...d, stripe_payment_intent_id: pay.paymentIntent, payment_method: pay.method };
      }
      await markSucceeded(deps, d, {});
      if (recurring.status === "incomplete" || recurring.status === "past_due")
        await repo.updateRecurring(recurring.id, { status: "active" });
      return "processed";
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const sub = invoiceSubscription(invoice);
      const recurring = sub ? await repo.findRecurringBySubscription(sub) : null;
      if (!invoice.id || !recurring) return "ignored";
      const pay = await deps.lookupInvoicePayment(invoice.id);
      let d = await repo.findDonationByInvoice(invoice.id);
      if (!d) {
        d = await repo.createDonationFromInvoice({
          recurring, invoice: invoice.id, paymentIntent: pay.paymentIntent,
          amount_cents: invoice.amount_due, status: "failed", paymentMethod: pay.method, settled: false,
        });
        await safeNotify(deps, "payment_failed", { donationId: d.id });
      } else if (advanceStatus(d.status, "failed") === "failed" && d.status !== "failed") {
        await repo.updateDonation(d.id, { status: "failed" });
        await safeNotify(deps, "payment_failed", { donationId: d.id });
      }
      if (recurring.status === "active") await repo.updateRecurring(recurring.id, { status: "past_due" });
      return "processed";
    }
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const recurring = await repo.findRecurringBySubscription(sub.id);
      if (!recurring) return "ignored";
      const mapped = SUB_STATUS[sub.status] ?? recurring.status;
      const end = sub.items.data[0]?.current_period_end;
      await repo.updateRecurring(recurring.id, {
        // never resurrect an already-canceled gift from a stale event
        status: recurring.status === "canceled" ? "canceled" : mapped,
        next_charge_at: mapped === "canceled" || !end ? null : new Date(end * 1000).toISOString(),
      });
      return "processed";
    }
    case "customer.subscription.deleted": {
      const recurring = await repo.findRecurringBySubscription(event.data.object.id);
      if (!recurring) return "ignored";
      if (recurring.status !== "canceled") {
        await repo.updateRecurring(recurring.id, { status: "canceled", canceled_at: new Date().toISOString(), next_charge_at: null });
        await safeNotify(deps, "recurring_canceled", { recurringId: recurring.id });
      }
      return "processed";
    }
    default:
      return "ignored";
  }
}

/** Claim → handle → finish. Safe under Stripe redelivery and concurrent delivery. */
export async function processWebhook(event: Stripe.Event, deps: HandlerDeps): Promise<"duplicate" | HandlerResult> {
  const claim = await deps.repo.claimEvent(event.id, event.type);
  if (claim === "done") return "duplicate";
  try {
    const result = await handleStripeEvent(event, deps);
    await deps.repo.finishEvent(event.id, result);
    return result;
  } catch (err) {
    // Record a sanitized message only. Never log payloads (may contain PII).
    await deps.repo.finishEvent(event.id, "failed", err instanceof Error ? err.name + ": " + err.message.slice(0, 200) : "unknown");
    throw err; // non-2xx => Stripe retries with backoff
  }
}
