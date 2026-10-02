import "server-only";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured, stripeLookups } from "@/lib/stripe/client";
import { processWebhook } from "@/lib/stripe/handlers";
import { supabaseDonationsRepo } from "@/lib/donations/repo.supabase";
import { notifyDonor } from "@/lib/donations/notify";
import { rateLimit } from "@/lib/rate-limit";
import { STRIPE_EVENT_TYPES } from "@/lib/stripe/sync";

/**
 * Brings ONE in-flight donation up to date from Stripe, without waiting for a webhook: finds the Stripe events about
 * this donation's own payment intent, invoice or subscription and runs them through the webhook handler. Called when
 * the donor (or staff) lands back from paying, so a gift is confirmed within seconds even if webhooks are delayed or
 * not configured. Idempotent and throttled per donation; does nothing once the donation is settled.
 */
export async function reconcileDonation(donationId: string): Promise<void> {
  if (!isStripeConfigured() || !rateLimit(`reconcile:${donationId}`, 1, 4000)) return;
  const db = createSupabaseAdminClient();
  const { data: d } = await db.from("donations").select("status, created_at, stripe_payment_intent_id, stripe_invoice_id, recurring_id").eq("id", donationId).maybeSingle();
  if (!d || !["pending", "processing"].includes(d.status)) return;

  const ids = new Set<string>([d.stripe_payment_intent_id, d.stripe_invoice_id].filter(Boolean) as string[]);
  if (d.recurring_id) {
    const { data: r } = await db.from("recurring_donations").select("stripe_subscription_id").eq("id", d.recurring_id).maybeSingle();
    if (r?.stripe_subscription_id) ids.add(r.stripe_subscription_id);
  }
  if (ids.size === 0) return;

  try {
    const since = Math.floor(new Date(d.created_at).getTime() / 1000) - 60;
    const mine: Stripe.Event[] = [];
    for await (const e of getStripe().events.list({ types: [...STRIPE_EVENT_TYPES], created: { gte: since }, limit: 100 })) {
      const obj = e.data.object as { id?: string; payment_intent?: string | { id: string } | null };
      const pi = typeof obj.payment_intent === "string" ? obj.payment_intent : obj.payment_intent?.id;
      if ((obj.id && ids.has(obj.id)) || (pi && ids.has(pi))) mine.push(e);
      if (mine.length >= 20) break;
    }
    mine.sort((a, b) => a.created - b.created);
    const deps = { repo: supabaseDonationsRepo(), notify: notifyDonor, ...stripeLookups };
    for (const e of mine) await processWebhook(e, deps).catch(() => undefined); // failures are recorded for the Reconciliation page
  } catch {
    /* Stripe unreachable: the webhook or the scheduled sync will catch up */
  }
}

/** Reconciles a donor's in-flight gifts from the last week (at most five), e.g. when staff open their record. */
export async function reconcileDonorInFlight(donorId: string): Promise<void> {
  const { data } = await createSupabaseAdminClient().from("donations").select("id").eq("donor_id", donorId).in("status", ["pending", "processing"])
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(5);
  await Promise.all((data ?? []).map((g) => reconcileDonation(g.id)));
}
