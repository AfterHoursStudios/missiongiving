"use server";

import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/session";
import { getOrgSettings, getSetting, setSetting } from "@/lib/settings";
import { getDonationProductId, getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { rateLimit } from "@/lib/rate-limit";
import { heldCentsByProject } from "@/lib/sponsor/sponsored";
import { remainingCents } from "@/lib/sponsor/holds";
import { checkoutSchema, resolveAmount, resolveSponsorship, type TierRow } from "./checkout";

export type CheckoutResult =
  | { ok: true; donationId: string; clientSecret: string }
  | { ok: false; error: string };

const PM_TYPES = ["card", "us_bank_account"] as ("card" | "us_bank_account")[];

/** Best-effort client identifier for rate-limiting guests, who have no account id to key on. */
async function guestKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function startCheckout(raw: unknown): Promise<CheckoutResult> {
  const user = await getUser(); // signed in, or a guest checking out with no account
  const settings = await getOrgSettings();
  if (!isStripeConfigured()) return { ok: false, error: "Payments are not configured yet." };

  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields and try again." };
  const input = parsed.data;

  if (!user && !settings.guest_donations_enabled) return { ok: false, error: "Please sign in or create a free account to give." };
  // Recurring gifts need an account: it's the only way to see, change or cancel them later. Guests can still give
  // once with no account; if they want to give monthly or yearly they're asked to sign in or register first.
  if (!user && input.frequency !== "one_time")
    return { ok: false, error: "Please sign in or create a free account to set up a recurring gift. One-time gifts don't need an account." };

  if ((input.paymentMethodId || input.fromAccount) && !user) return { ok: false, error: "Please sign in to use a saved payment method." };

  if (!rateLimit(`checkout:${user ? user.id : `guest:${await guestKey()}`}`, 10, 10 * 60_000).ok)
    return { ok: false, error: "Too many attempts. Please wait a few minutes." };

  const db = createSupabaseAdminClient();

  // Idempotency: a repeated submit with the same key never creates a second donation. For a signed-in donor this also
  // confirms the key still belongs to them; a guest has no account to check against, so the key alone is the guard
  // (it's a fresh random UUID per browser session, never guessable).
  const { data: dup } = await db.from("donations").select("id, donor_id, stripe_payment_intent_id, donor_profiles!inner(user_id)")
    .eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (dup) {
    if (user && (dup.donor_profiles as unknown as { user_id: string | null }).user_id !== user.id) return { ok: false, error: "Invalid request." };
    return { ok: false, error: user ? "This donation was already submitted. Check your account for its status." : "This donation was already submitted. Check your email for a receipt." };
  }

  // Destination
  let projectId: string | null = null;
  let fundId: string | null = null;
  let projectAllowsCustom = true;
  let sponsorAmount: { ok: true; amountCents: number; tierId: null } | null = null;
  if (input.destination.kind === "sponsorship") {
    const { data: sp } = await db.from("sponsorships").select("id, status, monthly_amount_cents, project_id").eq("id", input.destination.sponsorshipId).maybeSingle();
    const remaining = sp ? remainingCents(sp.monthly_amount_cents, (await heldCentsByProject()).get(sp.project_id) ?? 0) : 0;
    const r = resolveSponsorship(input.frequency, sp, { remainingCents: remaining, requestedCents: input.customAmountCents, minCents: settings.min_donation_cents });
    if (!r.ok) return r;
    const { data: backing } = await db.from("projects").select("id, fund_id").eq("id", sp!.project_id).single();
    if (!backing) return { ok: false, error: "This sponsorship is not available." };
    projectId = backing.id; fundId = backing.fund_id; sponsorAmount = r;
  } else if (input.destination.kind === "project") {
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
  const amount = sponsorAmount ?? resolveAmount(input, tier, {
    min: settings.min_donation_cents, max: settings.max_donation_cents,
    customEnabled: settings.custom_amount_enabled, projectAllowsCustom,
  });
  if (!amount.ok) return amount;

  // Donor record: one per account for a signed-in donor; for a guest, matched by email but only among records no
  // account has already claimed (never attach a guest's gift to somebody else's existing account by email alone).
  const email = user?.email ?? input.donor.email;
  const normalized = email.trim().toLowerCase();
  let { data: donor } = await (user
    ? db.from("donor_profiles").select("id, stripe_customer_id").eq("user_id", user.id)
    : db.from("donor_profiles").select("id, stripe_customer_id").eq("normalized_email", normalized).is("user_id", null)
  ).maybeSingle();
  const donorFields = {
    first_name: input.donor.firstName, last_name: input.donor.lastName, phone: input.donor.phone || null,
    organization_name: input.donor.organizationName || null,
    address_line1: input.donor.address?.line1 ?? null, city: input.donor.address?.city ?? null,
    region: input.donor.address?.region ?? null, postal_code: input.donor.address?.postalCode ?? null,
    public_recognition: settings.public_recognition_enabled && !input.anonymous,
  };
  const isNewDonor = !donor;
  if (input.fromAccount && !donor) return { ok: false, error: "Your account isn't set up for giving yet. Please use the donate page." };
  if (!donor) {
    const ins = await db.from("donor_profiles").insert({ user_id: user?.id ?? null, email, normalized_email: normalized, ...donorFields })
      .select("id, stripe_customer_id").single();
    if (ins.error) return { ok: false, error: "We could not save your details. Please try again." };
    donor = ins.data;
  } else if (!input.fromAccount) {
    await db.from("donor_profiles").update(donorFields).eq("id", donor.id);
  }
  // A new donor's email choices are saved as ticked (the boxes start ticked). For an existing donor, unticking a box
  // opts them out, but a ticked box never opts them back in: the pre-ticked form must not undo an earlier unsubscribe.
  if (isNewDonor) {
    await db.from("communication_preferences").upsert({
      donor_id: donor.id, marketing_email: input.marketingOptIn, project_updates: input.projectUpdatesOptIn, updated_at: new Date().toISOString(),
    });
  } else if (!input.fromAccount && (!input.marketingOptIn || !input.projectUpdatesOptIn)) {
    await db.from("communication_preferences").upsert({
      donor_id: donor.id,
      ...(!input.marketingOptIn ? { marketing_email: false } : {}),
      ...(!input.projectUpdatesOptIn ? { project_updates: false } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: "donor_id" });
  }

  const stripe = getStripe();
  let customerId = donor.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create(
      { email, name: `${input.donor.firstName} ${input.donor.lastName}`, metadata: { donor_id: donor.id } },
      { idempotencyKey: `cust-${donor.id}` },
    );
    customerId = customer.id;
    await db.from("donor_profiles").update({ stripe_customer_id: customerId }).eq("id", donor.id);
  }

  // A saved card/bank account must be on this donor's own Stripe customer.
  let savedPm: import("stripe").Stripe.PaymentMethod | null = null;
  if (input.paymentMethodId) {
    savedPm = await stripe.paymentMethods.retrieve(input.paymentMethodId).catch(() => null);
    const owner = typeof savedPm?.customer === "string" ? savedPm.customer : savedPm?.customer?.id;
    if (!savedPm || owner !== customerId || !["card", "us_bank_account"].includes(savedPm.type))
      return { ok: false, error: "That saved payment method was not found. Please choose another." };
  }
  const savedTypes = savedPm ? [savedPm.type as "card" | "us_bank_account"] : null;

  // Pending donation first; Stripe is authoritative for its final status (webhooks).
  const base = {
    donor_id: donor.id, fund_id: fundId, project_id: projectId, tier_id: amount.tierId,
    amount_cents: amount.amountCents, currency: settings.currency, frequency: input.frequency,
    payment_method: savedPm?.type === "us_bank_account" ? "us_bank_account" as const : "card" as const, status: "pending" as const, anonymous: input.anonymous,
    donor_note: input.note || null, idempotency_key: input.idempotencyKey,
  };
  const donationIns = await db.from("donations").insert(base).select("id").single();
  if (donationIns.error) return { ok: false, error: "This donation was already submitted." };
  const donationId = donationIns.data.id;

  if (input.dedication)
    await db.from("dedications").insert({ donation_id: donationId, kind: input.dedication.kind, name: input.dedication.name, message: input.dedication.message ?? null });

  const desc = "Donation to Ultimate Mission";

  try {
    if (input.frequency === "one_time") {
      // With a saved method the donor confirms it in their browser (so a bank's 3-D Secure check can still be shown).
      const pi = await stripe.paymentIntents.create({
        amount: amount.amountCents, currency: settings.currency.toLowerCase(), customer: customerId, description: desc,
        ...(savedPm
          ? { payment_method: savedPm.id, payment_method_types: savedTypes! }
          : { payment_method_types: PM_TYPES, payment_method_options: { us_bank_account: { financial_connections: { permissions: ["payment_method"] } } } }),
        metadata: { donation_id: donationId },
      }, { idempotencyKey: `pi-${input.idempotencyKey}` });
      await db.from("donations").update({ stripe_payment_intent_id: pi.id }).eq("id", donationId);
      return { ok: true, donationId, clientSecret: pi.client_secret! };
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
      ...(savedPm
        ? { default_payment_method: savedPm.id, payment_settings: { payment_method_types: savedTypes! } }
        : { payment_settings: { payment_method_types: PM_TYPES, save_default_payment_method: "on_subscription" as const } }),
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
    return { ok: true, donationId, clientSecret: secret };
  } catch (err) {
    await db.from("donations").update({ status: "failed" }).eq("id", donationId);
    console.error("[checkout] stripe error", err instanceof Error ? err.name : "unknown");
    return { ok: false, error: "We could not start your payment. You have not been charged." };
  }
}
