import "server-only";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured, stripeLookups } from "@/lib/stripe/client";
import { processWebhook } from "@/lib/stripe/handlers";
import { supabaseDonationsRepo } from "@/lib/donations/repo.supabase";
import { notifyDonor } from "@/lib/donations/notify";

/** The events the webhook endpoint subscribes to (docs/DEPLOYMENT.md §2). */
export const STRIPE_EVENT_TYPES = [
  "payment_intent.processing", "payment_intent.succeeded", "payment_intent.payment_failed", "payment_intent.canceled",
  "charge.refunded", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed",
  "invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted",
] as const;

export interface SyncResult { checked: number; processed: number; alreadyHandled: number; failed: number }

/**
 * Pulls recent payment events from Stripe's API and runs them through the same handler as the webhook. This heals
 * gifts stuck as "pending" when a webhook never arrived (no endpoint configured, an outage, local development).
 * Safe to run any time and as often as needed: each event is claimed once, and statuses only move forward.
 * Stripe keeps events for 30 days, so `days` is capped there.
 */
export async function syncRecentStripeEvents({ days = 2, max = 1000 }: { days?: number; max?: number } = {}): Promise<SyncResult> {
  if (!isStripeConfigured()) throw new Error("Stripe is not configured");
  const since = Math.floor(Date.now() / 1000) - Math.min(days, 30) * 86_400;
  const events: Stripe.Event[] = [];
  for await (const e of getStripe().events.list({ types: [...STRIPE_EVENT_TYPES], created: { gte: since }, limit: 100 })) {
    events.push(e);
    if (events.length >= max) break;
  }
  events.sort((a, b) => a.created - b.created); // oldest first, as Stripe would have delivered them

  const deps = { repo: supabaseDonationsRepo(), notify: notifyDonor, ...stripeLookups };
  const out: SyncResult = { checked: events.length, processed: 0, alreadyHandled: 0, failed: 0 };
  for (const event of events) {
    try {
      const r = await processWebhook(event, deps);
      if (r === "duplicate") out.alreadyHandled++; else out.processed++;
    } catch {
      out.failed++; // recorded on the event (webhook_events) and listed on the Reconciliation page for retry
    }
  }
  return out;
}
