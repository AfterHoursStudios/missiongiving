"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { audit } from "@/lib/audit";

/**
 * Staff type a donor's routing and account numbers instead of using Stripe's bank-connection window, which offers a
 * "Continue with Link" sign-in that remembers whoever last used Link on this computer (a previous donor). Stripe then
 * confirms the account with two small deposits the donor verifies before it can be charged.
 */
const STAFF_BANK_ENTRY = { us_bank_account: { verification_method: "microdeposits" as const } };
const uuid = z.string().uuid();

/**
 * For a donor who calls in with a new or replacement card/bank account. Staff click "Update payment method" on
 * their admin page; the donor reads their number to staff, who type it directly into Stripe's own secure fields
 * (see PaymentMethodForm) — it's never seen by our server, only a Stripe SetupIntent id comes back.
 */
export async function startPaymentMethodSetup(rawDonorId: unknown, rawKind: unknown = "card"): Promise<{ ok: true; clientSecret: string } | { ok: false; error: string }> {
  const kind = rawKind === "bank" ? "bank" : "card";
  const { perms } = await requirePermission("finance.view");
  if (!perms.has("expenses.record")) return { ok: false, error: "Your role can view finance data but cannot record entries." };
  const id = uuid.safeParse(rawDonorId);
  if (!id.success) return { ok: false, error: "Donor not found." };
  if (!isStripeConfigured()) return { ok: false, error: "Payments are not configured yet." };

  const db = createSupabaseAdminClient();
  const { data: donor } = await db.from("donor_profiles").select("id, stripe_customer_id, email, first_name, last_name").eq("id", id.data).is("deleted_at", null).maybeSingle();
  if (!donor) return { ok: false, error: "Donor not found." };

  const stripe = getStripe();
  let customerId = donor.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: donor.email, name: `${donor.first_name} ${donor.last_name}`, metadata: { donor_id: donor.id } }, { idempotencyKey: `cust-${donor.id}` });
    customerId = customer.id;
    await db.from("donor_profiles").update({ stripe_customer_id: customerId }).eq("id", donor.id);
  }

  // One setup per kind. Card: Stripe's card fields. Bank: staff type the numbers (see STAFF_BANK_ENTRY), verified by
  // micro-deposits. Link is never offered: it remembers whoever last signed in to it in this browser (a previous donor).
  const setup = kind === "card"
    ? await stripe.setupIntents.create({ customer: customerId, payment_method_types: ["card"], usage: "off_session" })
    : await stripe.setupIntents.create({ customer: customerId, payment_method_types: ["us_bank_account"], usage: "off_session", payment_method_options: STAFF_BANK_ENTRY });
  return { ok: true, clientSecret: setup.client_secret! };
}

/** After the donor's new payment method is confirmed with Stripe, makes it their default for future recurring gifts. */
export type SetupResult = { ok: boolean; error?: string; pendingVerification?: { url: string | null } };

export async function finalizePaymentMethodSetup(rawDonorId: unknown, rawSetupIntentId: unknown): Promise<SetupResult> {
  const { user, perms } = await requirePermission("finance.view");
  if (!perms.has("expenses.record")) return { ok: false, error: "Your role can view finance data but cannot record entries." };
  const id = uuid.safeParse(rawDonorId);
  const setupIntentId = z.string().trim().min(1).safeParse(rawSetupIntentId);
  if (!id.success || !setupIntentId.success || !isStripeConfigured()) return { ok: false, error: "Could not confirm the payment method." };

  const db = createSupabaseAdminClient();
  const { data: donor } = await db.from("donor_profiles").select("id, stripe_customer_id").eq("id", id.data).maybeSingle();
  if (!donor?.stripe_customer_id) return { ok: false, error: "Donor not found." };

  const stripe = getStripe();
  const setup = await stripe.setupIntents.retrieve(setupIntentId.data);
  // Confirms this setup really belongs to this donor's own Stripe customer, not one passed in from elsewhere.
  if (setup.customer !== donor.stripe_customer_id) return { ok: false, error: "This confirmation does not match this donor." };
  // A typed-in bank account waits for its two small test deposits to be verified; it can't be the default until then.
  if (setup.status === "requires_action" && setup.next_action?.type === "verify_with_microdeposits") {
    await audit(user.id, "financial.adjustment", "donor", donor.id, { op: "bank_account_pending_verification" });
    return { ok: true, pendingVerification: { url: setup.next_action.verify_with_microdeposits?.hosted_verification_url ?? null } };
  }
  if (setup.status !== "succeeded" || !setup.payment_method) return { ok: false, error: "The card or bank account could not be saved." };

  await stripe.customers.update(donor.stripe_customer_id, { invoice_settings: { default_payment_method: setup.payment_method as string } });
  await audit(user.id, "financial.adjustment", "donor", donor.id, { op: "payment_method_updated" });
  return { ok: true };
}

type PmState = { ok?: boolean; error?: string; message?: string } | undefined;

/** Loads the donor and checks the payment method really is on their own Stripe customer before any change. */
async function ownedPaymentMethod(form: FormData) {
  const p = z.object({ donorId: uuid, pmId: z.string().trim().regex(/^pm_[A-Za-z0-9]+$/) }).safeParse({ donorId: form.get("donorId"), pmId: form.get("pmId") });
  if (!p.success || !isStripeConfigured()) return null;
  const { data: donor } = await createSupabaseAdminClient().from("donor_profiles").select("id, stripe_customer_id").eq("id", p.data.donorId).is("deleted_at", null).maybeSingle();
  if (!donor?.stripe_customer_id) return null;
  const pm = await getStripe().paymentMethods.retrieve(p.data.pmId);
  return pm.customer === donor.stripe_customer_id ? { donorId: donor.id, customerId: donor.stripe_customer_id, pmId: pm.id } : null;
}

/** Makes a saved card/bank account the donor's default for future recurring gifts. */
export async function setDefaultPaymentMethod(_: PmState, form: FormData): Promise<PmState> {
  const { user, perms } = await requirePermission("finance.view");
  if (!perms.has("expenses.record")) return { error: "Your role can view finance data but cannot record entries." };
  const owned = await ownedPaymentMethod(form);
  if (!owned) return { error: "Payment method not found for this donor." };
  await getStripe().customers.update(owned.customerId, { invoice_settings: { default_payment_method: owned.pmId } });
  await audit(user.id, "financial.adjustment", "donor", owned.donorId, { op: "payment_method_default" });
  revalidatePath(`/admin/donors/${owned.donorId}`);
  return { ok: true, message: "Default payment method updated." };
}

/**
 * Deletes a saved card/bank account from the donor's Stripe customer. Refused while a live recurring gift would be
 * charged to it (its own payment method, or the customer default it falls back to), so no gift silently fails.
 */
export async function removePaymentMethod(_: PmState, form: FormData): Promise<PmState> {
  const { user, perms } = await requirePermission("finance.view");
  if (!perms.has("expenses.record")) return { error: "Your role can view finance data but cannot record entries." };
  const owned = await ownedPaymentMethod(form);
  if (!owned) return { error: "Payment method not found for this donor." };
  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(owned.customerId);
  const raw = "deleted" in customer && customer.deleted ? null : customer.invoice_settings?.default_payment_method;
  const customerDefault = typeof raw === "string" ? raw : raw?.id ?? null;
  const subs = await stripe.subscriptions.list({ customer: owned.customerId, status: "all", limit: 100 });
  const charges = subs.data
    .filter((s) => ["active", "past_due", "trialing", "unpaid", "incomplete"].includes(s.status))
    .some((s) => ((typeof s.default_payment_method === "string" ? s.default_payment_method : s.default_payment_method?.id) ?? customerDefault) === owned.pmId);
  if (charges) {
    return { error: customerDefault === owned.pmId
      ? "An active recurring gift charges this default card. Add another payment method and make it the default first, or end the recurring gift."
      : "An active recurring gift charges this payment method. Change that gift's payment method first." };
  }
  await stripe.paymentMethods.detach(owned.pmId);
  await audit(user.id, "financial.adjustment", "donor", owned.donorId, { op: "payment_method_removed" });
  revalidatePath(`/admin/donors/${owned.donorId}`);
  return { ok: true, message: "Payment method deleted." };
}
