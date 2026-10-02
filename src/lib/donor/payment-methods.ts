"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDonorContext } from "./context";
import type { ActionState } from "./actions";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

/**
 * A donor managing their own saved cards and bank accounts (Account > Payment methods). Every action works only on the
 * signed-in donor's own Stripe customer: no donor id is ever taken from the form, and each payment method is checked to
 * belong to that customer before it is changed. Card and bank numbers go from the browser straight to Stripe.
 */

const LIVE_SUB = ["active", "past_due", "trialing", "unpaid", "incomplete"];
const pmId = z.string().trim().regex(/^pm_[A-Za-z0-9]+$/);

export type DonorSetupResult = { ok: boolean; error?: string; pendingVerification?: { url: string | null }; paymentMethodId?: string };

/** Opens a Stripe SetupIntent for a new card or bank account, creating the donor's Stripe customer on first use. */
export async function startDonorPaymentMethodSetup(): Promise<{ ok: true; clientSecret: string } | { ok: false; error: string }> {
  const { user, donor } = await getDonorContext();
  if (!donor) return { ok: false, error: "Your account is set up with your first gift. Make a gift to save a payment method." };
  if (!isStripeConfigured()) return { ok: false, error: "Payments are not available right now. Please try again later." };
  // Saving cards is a common way to test stolen card numbers, so keep attempts low.
  if (!rateLimit(`pm-setup:${user.id}`, 5, 60 * 60_000).ok) return { ok: false, error: "Too many attempts. Please try again in an hour." };

  const stripe = getStripe();
  let customerId = donor.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create(
      { email: donor.email, name: `${donor.first_name} ${donor.last_name}`, metadata: { donor_id: donor.id } }, { idempotencyKey: `cust-${donor.id}` });
    customerId = customer.id;
    // Donors can't write this column themselves (column grants), so the service client records it.
    await createSupabaseAdminClient().from("donor_profiles").update({ stripe_customer_id: customerId }).eq("id", donor.id);
  }
  const setup = await stripe.setupIntents.create({ customer: customerId, payment_method_types: ["card", "us_bank_account"], usage: "off_session" });
  return { ok: true, clientSecret: setup.client_secret! };
}

/**
 * Makes a payment method the donor's default AND moves their live recurring gifts onto it. Online recurring gifts keep
 * their own payment method (save_default_payment_method: "on_subscription"), which outranks the customer default, so
 * changing only the default would leave them charging the old card.
 */
async function applyToAllGifts(customerId: string, paymentMethodId: string) {
  const stripe = getStripe();
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  await Promise.all(subs.data.filter((s) => LIVE_SUB.includes(s.status))
    .map((s) => stripe.subscriptions.update(s.id, { default_payment_method: paymentMethodId })));
}

/**
 * Called when Stripe sends the donor back after confirming a new card or bank account (?setup_intent=…). From the
 * Payment methods page the new method also becomes the one their recurring gifts use; from the Give page
 * (`applyToGifts` false) it's only saved, ready to pick for that gift.
 */
export async function finalizeDonorPaymentMethodSetup(rawSetupIntentId: unknown, applyToGifts = true): Promise<DonorSetupResult> {
  const id = z.string().trim().regex(/^seti_[A-Za-z0-9]+$/).safeParse(rawSetupIntentId);
  const { user, donor } = await getDonorContext();
  if (!id.success || !donor?.stripe_customer_id || !isStripeConfigured()) return { ok: false, error: "We could not confirm that payment method." };

  const setup = await getStripe().setupIntents.retrieve(id.data);
  // It must belong to this donor's own Stripe customer, not one passed in from elsewhere.
  if (setup.customer !== donor.stripe_customer_id) return { ok: false, error: "We could not confirm that payment method." };
  if (setup.status === "requires_action" && setup.next_action?.type === "verify_with_microdeposits") {
    return { ok: true, pendingVerification: { url: setup.next_action.verify_with_microdeposits?.hosted_verification_url ?? null } };
  }
  if (setup.status !== "succeeded" || !setup.payment_method) return { ok: false, error: "The card or bank account could not be saved." };

  const paymentMethodId = setup.payment_method as string;
  if (applyToGifts) await applyToAllGifts(donor.stripe_customer_id, paymentMethodId);
  await audit(user.id, "financial.adjustment", "donor", donor.id, { op: applyToGifts ? "payment_method_updated" : "payment_method_added", by: "donor" });
  // No revalidatePath: this runs while the page renders, and that page reads the methods fresh from Stripe anyway.
  return { ok: true, paymentMethodId };
}

type DonorCtx = Awaited<ReturnType<typeof getDonorContext>>;

/** The signed-in donor's Stripe customer, if this payment method is on it. */
async function ownedPaymentMethod(form: FormData, { user, donor }: DonorCtx) {
  const p = pmId.safeParse(form.get("pmId"));
  if (!p.success || !donor?.stripe_customer_id || !isStripeConfigured()) return null;
  const pm = await getStripe().paymentMethods.retrieve(p.data);
  return pm.customer === donor.stripe_customer_id ? { userId: user.id, donorId: donor.id, customerId: donor.stripe_customer_id, pmId: pm.id } : null;
}

export async function setDonorDefaultPaymentMethod(_: ActionState, form: FormData): Promise<ActionState> {
  const owned = await ownedPaymentMethod(form, await getDonorContext());
  if (!owned) return { error: "Payment method not found." };
  await applyToAllGifts(owned.customerId, owned.pmId);
  await audit(owned.userId, "financial.adjustment", "donor", owned.donorId, { op: "payment_method_default", by: "donor" });
  revalidatePath("/dashboard/payment-methods");
  return { ok: true, message: "Your gifts will now use this payment method." };
}

/** Removes a saved card/bank account. Refused while a live recurring gift would be charged to it. */
export async function removeDonorPaymentMethod(_: ActionState, form: FormData): Promise<ActionState> {
  const owned = await ownedPaymentMethod(form, await getDonorContext());
  if (!owned) return { error: "Payment method not found." };
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(owned.customerId);
  const raw = "deleted" in customer && customer.deleted ? null : customer.invoice_settings?.default_payment_method;
  const customerDefault = typeof raw === "string" ? raw : raw?.id ?? null;
  const subs = await stripe.subscriptions.list({ customer: owned.customerId, status: "all", limit: 100 });
  const charged = subs.data.filter((s) => LIVE_SUB.includes(s.status))
    .some((s) => ((typeof s.default_payment_method === "string" ? s.default_payment_method : s.default_payment_method?.id) ?? customerDefault) === owned.pmId);
  if (charged) return { error: "A recurring gift uses this payment method. Add another one and choose \"Use for my gifts\" on it first, or cancel the recurring gift." };
  await stripe.paymentMethods.detach(owned.pmId);
  await audit(owned.userId, "financial.adjustment", "donor", owned.donorId, { op: "payment_method_removed", by: "donor" });
  revalidatePath("/dashboard/payment-methods");
  return { ok: true, message: "Payment method removed." };
}
