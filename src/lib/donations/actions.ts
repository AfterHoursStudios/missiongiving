"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getOrgSettings, getSetting, setSetting } from "@/lib/settings";
import { getDonationProductId, getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { rateLimit } from "@/lib/rate-limit";
import { publicEnv } from "@/lib/env";
import { checkoutSchema, resolveAmount, type TierRow } from "./checkout";

export type CheckoutResult =
  | { ok: true; donationId: string; clientSecret: string; returnUrl: string }
  | { ok: false; error: string };

const PM_TYPES = ["card", "us_bank_account"] as ("card" | "us_bank_account")[];

export async function startCheckout(raw: unknown): Promise<CheckoutResult> {
  const user = await requireUser(); // guest donations are disabled by default; signed-in donors only
  const settings = await getOrgSettings();
  if (!user.email) return { ok: false, error: "Your account has no email address." };
  if (!isStripeConfigured()) return { ok: false, error: "Payments are not configured yet." };

  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields and try again." };
  const input = parsed.data;

  if (!rateLimit(`checkout:${user.id}`, 10, 10 * 60_000).ok) return { ok: false, error: "Too many attempts. Please wait a few minutes." };

  const db = createSupabaseAdminClient();

  // Idempotency: a repeated submit with the same key never creates a second donation.
  const { data: dup } = await db.from("donations").select("id, donor_id, stripe_payment_intent_id, donor_profiles!inner(user_id)")
    .eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (dup) {
    if ((dup.donor_profiles as unknown as { user_id: string }).user_id !== user.id) return { ok: false, error: "Invalid request." };
    return { ok: false, error: "This donation was already submitted. Check your account for its status." };
  }

  // Destination
  let projectId: string | null = null;
  let fundId: string | null = null;
  let projectAllowsCustom = true;
  if (input.destination.kind === "project") {
    const { data: project } = await db.from("projects").select("id, fund_id, status, is_public, allow_custom_amount")
      .eq("id", input.destination.projectId).maybeSingle();
    if (!project || !project.is_public || !["active", "goal_reached"].includes(project.status))
      return { ok: false, error: "That project is not accepting donations." };
    projectId = project.id; fundId = project.fund_id; projectAllowsCustom = project.allow_custom_amount;
  }
  if (!fundId) {
    const { data: general } = await db.from("funds").select("id").eq("key", "general").single();
    fundId = general?.id ?? null;
  }

  // Amount: resolved on the server
  const tier = input.tierId
    ? ((await db.from("donation_tiers").select("id, amount_cents, status, project_id, general_fund, allow_one_time, allow_monthly, allow_yearly, active_from, active_until")
        .eq("id", input.tierId).maybeSingle()).data as TierRow | null)
    : null;
  const amount = resolveAmount(input, tier, {
    min: settings.min_donation_cents, max: settings.max_donation_cents,
    customEnabled: settings.custom_amount_enabled, projectAllowsCustom,
  });
  if (!amount.ok) return amount;

  // Donor record (one per account)
  const normalized = user.email.trim().toLowerCase();
  let { data: donor } = await db.from("donor_profiles").select("id, stripe_customer_id").eq("user_id", user.id).maybeSingle();
  const donorFields = {
    first_name: input.donor.firstName, last_name: input.donor.lastName, phone: input.donor.phone || null,
    address_line1: input.donor.address?.line1 ?? null, city: input.donor.address?.city ?? null,
    region: input.donor.address?.region ?? null, postal_code: input.donor.address?.postalCode ?? null,
    public_recognition: settings.public_recognition_enabled && !input.anonymous,
  };
  if (!donor) {
    const ins = await db.from("donor_profiles").insert({ user_id: user.id, email: user.email, normalized_email: normalized, ...donorFields })
      .select("id, stripe_customer_id").single();
    if (ins.error) return { ok: false, error: "We could not save your details. Please try again." };
    donor = ins.data;
  } else {
    await db.from("donor_profiles").update(donorFields).eq("id", donor.id);
  }
  await db.from("communication_preferences").upsert({
    donor_id: donor.id, marketing_email: input.marketingOptIn, project_updates: input.projectUpdatesOptIn, updated_at: new Date().toISOString(),
  });

  const stripe = getStripe();
  let customerId = donor.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create(
      { email: user.email, name: `${input.donor.firstName} ${input.donor.lastName}`, metadata: { donor_id: donor.id } },
      { idempotencyKey: `cust-${donor.id}` },
    );
    customerId = customer.id;
    await db.from("donor_profiles").update({ stripe_customer_id: customerId }).eq("id", donor.id);
  }

  // Pending donation first; Stripe is authoritative for its final status (webhooks).
  const base = {
    donor_id: donor.id, fund_id: fundId, project_id: projectId, tier_id: amount.tierId,
    amount_cents: amount.amountCents, currency: settings.currency, frequency: input.frequency,
    payment_method: "card" as const, status: "pending" as const, anonymous: input.anonymous,
    donor_note: input.note || null, idempotency_key: input.idempotencyKey,
  };
  const donationIns = await db.from("donations").insert(base).select("id").single();
  if (donationIns.error) return { ok: false, error: "This donation was already submitted." };
  const donationId = donationIns.data.id;

  if (input.dedication)
    await db.from("dedications").insert({ donation_id: donationId, kind: input.dedication.kind, name: input.dedication.name, message: input.dedication.message ?? null });

  const returnUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/donate/confirmation?donation=${donationId}`;
  const desc = "Donation to Ultimate Mission";

  try {
    if (input.frequency === "one_time") {
      const pi = await stripe.paymentIntents.create({
        amount: amount.amountCents, currency: settings.currency.toLowerCase(), customer: customerId,
        payment_method_types: PM_TYPES, description: desc,
        payment_method_options: { us_bank_account: { financial_connections: { permissions: ["payment_method"] } } },
        metadata: { donation_id: donationId },
      }, { idempotencyKey: `pi-${input.idempotencyKey}` });
      await db.from("donations").update({ stripe_payment_intent_id: pi.id }).eq("id", donationId);
      return { ok: true, donationId, clientSecret: pi.client_secret!, returnUrl };
    }

    const productId = await getDonationProductId(
      async () => ((await getSetting("stripe_donation_product_id")) as string | null),
      (id) => setSetting("stripe_donation_product_id", id, null),
    );
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price_data: {
        currency: settings.currency.toLowerCase(), product: productId, unit_amount: amount.amountCents,
        recurring: { interval: input.frequency === "monthly" ? "month" : "year" },
      } }],
      payment_behavior: "default_incomplete",
      payment_settings: { payment_method_types: PM_TYPES, save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.confirmation_secret"],
      metadata: { donation_id: donationId },
    }, { idempotencyKey: `sub-${input.idempotencyKey}` });

    const invoice = sub.latest_invoice as import("stripe").Stripe.Invoice;
    const rec = await db.from("recurring_donations").insert({
      donor_id: donor.id, fund_id: fundId, project_id: projectId, tier_id: amount.tierId,
      amount_cents: amount.amountCents, currency: settings.currency, frequency: input.frequency,
      status: "incomplete", stripe_subscription_id: sub.id, stripe_customer_id: customerId,
    }).select("id").single();
    if (rec.error) throw new Error("recurring insert failed");
    await db.from("donations").update({ recurring_id: rec.data.id, stripe_invoice_id: invoice.id }).eq("id", donationId);
    const secret = invoice.confirmation_secret?.client_secret;
    if (!secret) throw new Error("missing client secret");
    return { ok: true, donationId, clientSecret: secret, returnUrl };
  } catch (err) {
    await db.from("donations").update({ status: "failed" }).eq("id", donationId);
    console.error("[checkout] stripe error", err instanceof Error ? err.name : "unknown");
    return { ok: false, error: "We could not start your payment. You have not been charged." };
  }
}
