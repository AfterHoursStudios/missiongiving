import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { DonationsRepo, DonationRow, RecurringRow } from "./repo";

const DONATION_COLS = "id, donor_id, recurring_id, amount_cents, refunded_cents, payment_method, status, stripe_payment_intent_id, stripe_invoice_id";
const RECURRING_COLS = "id, donor_id, fund_id, project_id, tier_id, amount_cents, frequency, status, stripe_subscription_id";

export function supabaseDonationsRepo(): DonationsRepo {
  const db = createSupabaseAdminClient();
  const must = <T>(r: { data: T | null; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data as T;
  };

  const mustOne = <T>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    if (r.data === null) throw new Error("expected a row");
    return r.data;
  };

  return {
    async claimEvent(eventId, type) {
      // Atomic claim: the primary key makes concurrent deliveries race safely.
      const ins = await db.from("webhook_events").insert({ stripe_event_id: eventId, type, attempts: 1 });
      if (!ins.error) return "new";
      if (ins.error.code !== "23505") throw new Error(ins.error.message);
      const cur = mustOne<{ status: string; attempts: number }>(await db.from("webhook_events").select("status, attempts").eq("stripe_event_id", eventId).single());
      if (cur.status === "processed" || cur.status === "ignored") return "done";
      await db.from("webhook_events").update({ attempts: cur.attempts + 1, status: "received" }).eq("stripe_event_id", eventId);
      return "retry";
    },
    async finishEvent(eventId, status, error) {
      await db.from("webhook_events").update({ status, error: error ?? null, processed_at: new Date().toISOString() }).eq("stripe_event_id", eventId);
    },
    async findDonationByPaymentIntent(pi) {
      return must(await db.from("donations").select(DONATION_COLS).eq("stripe_payment_intent_id", pi).maybeSingle()) as DonationRow | null;
    },
    async findDonationByInvoice(inv) {
      return must(await db.from("donations").select(DONATION_COLS).eq("stripe_invoice_id", inv).maybeSingle()) as DonationRow | null;
    },
    async updateDonation(donationId, patch) {
      must(await db.from("donations").update(patch).eq("id", donationId));
    },
    async createDonationFromInvoice(r) {
      // An initial pending row may already exist from checkout; otherwise this is a renewal.
      const row = mustOne<DonationRow>(await db.from("donations").insert({
        donor_id: r.recurring.donor_id, fund_id: r.recurring.fund_id, project_id: r.recurring.project_id,
        tier_id: r.recurring.tier_id, recurring_id: r.recurring.id, amount_cents: r.amount_cents,
        frequency: r.recurring.frequency, payment_method: r.paymentMethod, status: r.status,
        stripe_invoice_id: r.invoice, stripe_payment_intent_id: r.paymentIntent,
      }).select(DONATION_COLS).single());
      return row;
    },
    async findRecurringBySubscription(sub) {
      return must(await db.from("recurring_donations").select(RECURRING_COLS).eq("stripe_subscription_id", sub).maybeSingle()) as RecurringRow | null;
    },
    async updateRecurring(recurringId, patch) {
      must(await db.from("recurring_donations").update(patch).eq("id", recurringId));
    },
    async ensureReceipt(donationId, final) {
      const existing = must<{ receipt_number: string; is_final: boolean } | null>(await db.from("receipts").select("receipt_number, is_final").eq("donation_id", donationId).maybeSingle());
      if (existing) {
        if (final && !existing.is_final) {
          must(await db.from("receipts").update({ is_final: true, issued_at: new Date().toISOString() }).eq("donation_id", donationId));
          return { receipt_number: existing.receipt_number, is_final: true };
        }
        return existing;
      }
      const ins = await db.from("receipts").insert({ donation_id: donationId, is_final: final }).select("receipt_number, is_final").single();
      if (ins.error?.code === "23505") { // concurrent insert won the race
        return mustOne<{ receipt_number: string; is_final: boolean }>(await db.from("receipts").select("receipt_number, is_final").eq("donation_id", donationId).single());
      }
      return mustOne<{ receipt_number: string; is_final: boolean }>(ins);
    },
    async upsertDispute(d) {
      must(await db.from("disputes").upsert({
        donation_id: d.donationId, stripe_dispute_id: d.stripeDisputeId, amount_cents: d.amount_cents, status: d.status, reason: d.reason,
      }, { onConflict: "stripe_dispute_id" }));
    },
  };
}
