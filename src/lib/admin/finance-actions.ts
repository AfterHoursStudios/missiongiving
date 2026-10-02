"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { syncRecentStripeEvents } from "@/lib/stripe/sync";
import { getOrgSettings } from "@/lib/settings";
import { getStripe, isStripeConfigured, stripeLookups } from "@/lib/stripe/client";
import { processWebhook } from "@/lib/stripe/handlers";
import { supabaseDonationsRepo } from "@/lib/donations/repo.supabase";
import { notifyDonor } from "@/lib/donations/notify";
import { rateLimit } from "@/lib/rate-limit";
import { offlineGiftSchema, refundSchema, validateRefund } from "./finance-logic";
import type { AdminState } from "./donor-actions";

/** Records a gift received outside the site (check, cash, wire). Needs both finance and expense-recording access; always audited. */
export async function recordOfflineGift(_: AdminState, form: FormData): Promise<AdminState> {
  const { user, perms } = await requirePermission("finance.view");
  if (!perms.has("expenses.record")) return { error: "Recording offline gifts requires finance recording access." };
  const p = offlineGiftSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const v = p.data;
  const db = createSupabaseAdminClient();
  const settings = await getOrgSettings();

  let { data: donor } = await db.from("donor_profiles").select("id, first_name").eq("normalized_email", v.email).is("deleted_at", null).maybeSingle();
  if (!donor) {
    if (!v.first_name || !v.last_name) return { error: "No donor has that email. Enter a first and last name to create one." };
    const ins = await db.from("donor_profiles").insert({ email: v.email, normalized_email: v.email, first_name: v.first_name, last_name: v.last_name }).select("id, first_name").single();
    if (ins.error) return { error: "Could not create the donor record." };
    donor = ins.data;
  }

  let fundId: string | null = null;
  if (v.project_id) {
    const { data: proj } = await db.from("projects").select("fund_id").eq("id", v.project_id).maybeSingle();
    if (!proj) return { error: "That project does not exist." };
    fundId = proj.fund_id;
  } else fundId = (await db.from("funds").select("id").eq("key", "general").maybeSingle()).data?.id ?? null;

  const when = `${v.date}T12:00:00Z`;
  const { data: gift, error } = await db.from("donations").insert({
    donor_id: donor.id, fund_id: fundId, project_id: v.project_id, amount_cents: v.amount, currency: settings.currency, frequency: "one_time",
    payment_method: "offline", status: "succeeded", is_offline: true, donor_note: [v.method, v.reference].filter(Boolean).join(" · ") || null,
    settled_at: when, donated_at: when,
  }).select("id").single();
  if (error || !gift) return { error: "Could not record the gift." };
  await db.from("receipts").insert({ donation_id: gift.id, is_final: true });
  await audit(user.id, "financial.adjustment", "donation", gift.id, { kind: "offline_gift", amount_cents: v.amount, method: v.method, project_id: v.project_id });
  if (v.send_receipt) notifyDonor("donation_success", { donationId: gift.id }).catch(() => {});
  revalidatePath("/admin");
  return { ok: true, message: `Offline gift recorded${v.send_receipt ? " and receipt emailed" : ""}.` };
}

/**
 * Submits a refund to Stripe. Donation totals and status are then updated by the signed `charge.refunded` webhook (the source
 * of truth), so a browser/response can never mark money as refunded on its own.
 */
export async function refundDonation(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("refunds.issue");
  const p = refundSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!isStripeConfigured()) return { error: "Stripe is not configured." };
  if (!rateLimit(`refund:${user.id}`, 20, 60 * 60_000).ok) return { error: "Too many refunds in a short time. Try again later." };

  const db = createSupabaseAdminClient();
  const { data: d } = await db.from("donations").select("id, donor_id, amount_cents, refunded_cents, status, payment_method, stripe_payment_intent_id").eq("id", p.data.donationId).maybeSingle();
  if (!d) return { error: "Donation not found." };
  const problem = validateRefund({ status: d.status, payment_method: d.payment_method, amount_cents: d.amount_cents, refunded_cents: d.refunded_cents, has_payment_intent: !!d.stripe_payment_intent_id }, p.data.amount);
  if (problem) return { error: problem };

  let refund;
  try {
    // Same donation + same already-refunded total + same amount => same key, so a double click cannot refund twice.
    refund = await getStripe().refunds.create(
      { payment_intent: d.stripe_payment_intent_id!, amount: p.data.amount, reason: "requested_by_customer", metadata: { donation_id: d.id, staff_user: user.id } },
      { idempotencyKey: `refund-${d.id}-${d.refunded_cents}-${p.data.amount}` },
    );
  } catch (e) {
    console.error("[refund] stripe error", e instanceof Error ? e.name : "unknown");
    return { error: "Stripe could not process the refund. Check the payment in Stripe." };
  }
  const ins = await db.from("refunds").insert({ donation_id: d.id, amount_cents: p.data.amount, reason: p.data.reason, stripe_refund_id: refund.id, issued_by: user.id });
  if (ins.error && ins.error.code !== "23505") console.error("[refund] could not record refund row");
  await audit(user.id, "refund.issue", "donation", d.id, { amount_cents: p.data.amount, stripe_refund_id: refund.id, reason: p.data.reason });
  revalidatePath(`/admin/donors/${d.donor_id}`);
  return { ok: true, message: "Refund submitted to Stripe. The gift's status updates when Stripe confirms it." };
}

/** Re-fetches a failed or stalled event from Stripe and runs it through the same idempotent processor the webhook uses. */
export async function retryWebhook(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("finance.view");
  const id = z.string().regex(/^evt_[A-Za-z0-9]+$/).safeParse(form.get("eventId"));
  if (!id.success) return { error: "Invalid event id." };
  const db = createSupabaseAdminClient();
  const { data: row } = await db.from("webhook_events").select("status").eq("stripe_event_id", id.data).maybeSingle();
  if (!row || !["failed", "received"].includes(row.status)) return { error: "Only failed or stalled events can be retried." };
  try {
    const event = await getStripe().events.retrieve(id.data);
    await processWebhook(event, { repo: supabaseDonationsRepo(), notify: notifyDonor, ...stripeLookups });
  } catch {
    return { error: "The retry failed. See the event's error, fix the cause, and try again." };
  }
  await audit(user.id, "webhook.retry", "webhook_event", id.data);
  revalidatePath("/admin/reconciliation");
  return { ok: true, message: "Event reprocessed." };
}

/** "Sync with Stripe": replays recent Stripe payment events so gifts stuck as pending (a missed webhook) are updated. */
export async function syncWithStripe(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("finance.view");
  const days = z.coerce.number().int().min(1).max(30).catch(7).parse(form.get("days") ?? 7);
  let r;
  try { r = await syncRecentStripeEvents({ days }); } catch { return { error: "Could not reach Stripe. Check the Stripe keys and try again." }; }
  await audit(user.id, "webhook.retry", "stripe_sync", undefined, { days, ...r });
  revalidatePath("/admin/reconciliation");
  revalidatePath("/admin/donors", "layout");
  return {
    ok: !r.failed,
    message: `Checked ${r.checked} Stripe event${r.checked === 1 ? "" : "s"} from the last ${days} days: ${r.processed} applied, ${r.alreadyHandled} already up to date${r.failed ? `, ${r.failed} failed (listed below to retry)` : ""}.`,
  };
}
