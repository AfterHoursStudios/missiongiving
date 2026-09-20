import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeLookups } from "@/lib/stripe/client";
import { serverEnv } from "@/lib/env";
import { processWebhook } from "@/lib/stripe/handlers";
import { supabaseDonationsRepo } from "@/lib/donations/repo.supabase";
import { notifyDonor } from "@/lib/donations/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe is the source of truth for payment state. The signature is verified against the raw body;
 * unsigned or tampered requests are rejected. A non-2xx response makes Stripe retry with backoff, which
 * is safe because processing is idempotent (webhook_events claim + monotonic status transitions).
 */
export async function POST(request: Request) {
  const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "not configured" }, { status: 400 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const result = await processWebhook(event, {
      repo: supabaseDonationsRepo(),
      notify: notifyDonor,
      ...stripeLookups,
    });
    return NextResponse.json({ received: true, result });
  } catch (err) {
    // Log type and id only: payloads can contain personal data.
    console.error("[stripe-webhook] handler failed", { id: event.id, type: event.type, name: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
