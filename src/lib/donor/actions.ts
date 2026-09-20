"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDonorContext } from "./context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getOrgSettings, getSetting } from "@/lib/settings";
import { getStripe } from "@/lib/stripe/client";
import { notifyDonor } from "@/lib/donations/notify";
import { dollarsToCents, validateDonationAmount } from "@/lib/money";
import { rateLimit } from "@/lib/rate-limit";
import { publicEnv } from "@/lib/env";

export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

/** Loads a recurring gift through the user-scoped client (RLS). Returns null unless it belongs to the caller. */
async function ownRecurring(id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const { supabase, donor } = await getDonorContext();
  if (!donor) return null;
  const { data } = await supabase.from("recurring_donations")
    .select("id, donor_id, status, amount_cents, frequency, stripe_subscription_id, stripe_customer_id, tier_id, project_id")
    .eq("id", id).eq("donor_id", donor.id).maybeSingle();
  return data;
}

export async function cancelRecurring(_: ActionState, form: FormData): Promise<ActionState> {
  const rec = await ownRecurring(String(form.get("id")));
  if (!rec || !rec.stripe_subscription_id) return { error: "Recurring gift not found." };
  if (form.get("confirm") !== "yes") return { error: "Please confirm the cancellation." };
  if (rec.status === "canceled" || rec.status === "completed") return { error: "This gift is already ended." };
  try {
    await getStripe().subscriptions.cancel(rec.stripe_subscription_id, undefined, { idempotencyKey: `cancel-${rec.id}` });
  } catch (e) {
    // A subscription already canceled at Stripe is fine; anything else is a real failure.
    if (!(e instanceof Error && /No such subscription|canceled/i.test(e.message))) return { error: "We could not cancel this gift. Please try again or contact us." };
  }
  // History is preserved: only status changes. The webhook later sees it as already canceled and will not double-send.
  await createSupabaseAdminClient().from("recurring_donations")
    .update({ status: "canceled", canceled_at: new Date().toISOString(), next_charge_at: null, cancel_reason: "donor_requested" }).eq("id", rec.id);
  notifyDonor("recurring_canceled", { recurringId: rec.id }).catch(() => {});
  revalidatePath("/dashboard/recurring");
  return { ok: true, message: "Your recurring gift was canceled. Past gifts and receipts are unchanged." };
}

const amountSchema = z.object({ id: z.string().uuid(), amount: z.string() });

export async function updateRecurringAmount(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = amountSchema.safeParse({ id: form.get("id"), amount: form.get("amount") });
  if (!parsed.success) return { error: "Enter a valid amount." };
  const settings = await getOrgSettings();
  if (!settings.recurring_amount_change_enabled) return { error: "Changing the amount online is not available. Please contact us." };
  const rec = await ownRecurring(parsed.data.id);
  if (!rec || !rec.stripe_subscription_id || !["active", "past_due"].includes(rec.status)) return { error: "This gift can't be changed." };

  let cents: number;
  try { cents = dollarsToCents(parsed.data.amount); } catch { return { error: "Enter a valid amount, like 25 or 25.50." }; }
  const err = validateDonationAmount(cents, settings.min_donation_cents, settings.max_donation_cents);
  if (err) return { error: err };
  if (cents === rec.amount_cents) return { error: "That is already your gift amount." };
  if (!rateLimit(`amt:${rec.id}`, 5, 60 * 60_000).ok) return { error: "Too many changes. Please try again later." };

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(rec.stripe_subscription_id);
  const item = sub.items.data[0];
  const productId = (await getSetting("stripe_donation_product_id")) as string | null;
  if (!item || !productId) return { error: "We could not update this gift. Please contact us." };
  await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, price_data: { currency: item.price.currency, product: productId, unit_amount: cents, recurring: { interval: rec.frequency === "monthly" ? "month" : "year" } } }],
    proration_behavior: "none", // new amount applies from the next charge
  });
  // Tier no longer describes the amount once it is customized.
  await createSupabaseAdminClient().from("recurring_donations").update({ amount_cents: cents, tier_id: null }).eq("id", rec.id);
  revalidatePath("/dashboard/recurring");
  return { ok: true, message: "Your new amount will apply from your next scheduled gift." };
}

/** Sends the donor to Stripe's hosted portal to update their card or bank account. Requires the portal to be enabled in Stripe. */
export async function openPaymentMethodPortal() {
  const { donor } = await getDonorContext();
  if (!donor?.stripe_customer_id) redirect("/dashboard/recurring?portal=missing");
  let url: string;
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: donor.stripe_customer_id, return_url: `${publicEnv.NEXT_PUBLIC_APP_URL}/dashboard/recurring`,
    });
    url = session.url;
  } catch {
    redirect("/dashboard/recurring?portal=unavailable");
  }
  redirect(url);
}

const profileSchema = z.object({
  first_name: z.string().trim().min(1, "Enter your first name").max(80),
  last_name: z.string().trim().min(1, "Enter your last name").max(80),
  phone: z.string().trim().max(30).optional(),
  address_line1: z.string().trim().max(120).optional(), address_line2: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(), region: z.string().trim().max(80).optional(), postal_code: z.string().trim().max(20).optional(),
});

export async function updateProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, donor } = await getDonorContext();
  if (!donor) return { error: "No donor profile yet. It is created with your first gift." };
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;
  // Explicit allow-list (no mass assignment); column grants + RLS also restrict what a donor can write.
  const { error } = await supabase.from("donor_profiles").update({
    first_name: v.first_name, last_name: v.last_name, phone: v.phone || null,
    address_line1: v.address_line1 || null, address_line2: v.address_line2 || null,
    city: v.city || null, region: v.region || null, postal_code: v.postal_code || null,
    public_recognition: form.get("public_recognition") === "on",
  }).eq("id", donor.id);
  if (error) return { error: "We could not save your changes." };
  revalidatePath("/dashboard/profile");
  return { ok: true, message: "Profile saved." };
}

export async function updatePreferences(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, donor } = await getDonorContext();
  if (!donor) return { error: "No donor profile yet." };
  // Unsubscribing must always be honored; a staff/bounce-set `suppressed` flag is never cleared here.
  const { error } = await supabase.from("communication_preferences").upsert({
    donor_id: donor.id,
    marketing_email: form.get("marketing_email") === "on",
    project_updates: form.get("project_updates") === "on",
    annual_statement_email: form.get("annual_statement_email") === "on",
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: "We could not save your preferences." };
  revalidatePath("/dashboard/profile");
  return { ok: true, message: "Preferences saved. Receipts are always emailed to you." };
}

export async function changePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await getDonorContext();
  const pw = z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/\d/).safeParse(form.get("password"));
  if (!pw.success) return { error: "Use at least 12 characters with upper case, lower case and a number." };
  const { error } = await supabase.auth.updateUser({ password: pw.data });
  return error ? { error: "We could not change your password. Please sign in again and retry." } : { ok: true, message: "Password changed." };
}

export async function requestAccountDeletion(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, donor } = await getDonorContext();
  if (!donor) return { error: "No donor profile found." };
  if (form.get("confirm") !== "DELETE") return { error: "Type DELETE to confirm." };
  const { error } = await supabase.from("data_requests").insert({ donor_id: donor.id, kind: "deletion", status: "open" });
  if (error?.code === "23505") return { ok: true, message: "Your deletion request is already open." };
  if (error) return { error: "We could not submit your request." };
  return { ok: true, message: "Request received. Staff will review it. Gift records required for financial and tax purposes are retained, but your personal details are removed." };
}
