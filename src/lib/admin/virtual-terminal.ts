"use server";

import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getOrgSettings, getSetting, setSetting } from "@/lib/settings";
import { getDonationProductId, getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { validateDonationAmount } from "@/lib/money";
import { audit } from "@/lib/audit";
import { isPlaceholderEmail } from "@/lib/admin/dp-import";
import { reconcileDonation } from "@/lib/stripe/reconcile-donation";
import type { CheckoutResult } from "@/lib/donations/actions";


const schema = z.object({
  donorId: z.string().uuid().optional(), // set when started from an existing donor's page; skips the lookup/create below
  // Blank means "not entered" (e.g. the hidden fields when started from a donor's page), not an invalid email.
  email: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().toLowerCase().email("Enter a valid email").optional()),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  amount: z.string().trim(),
  frequency: z.enum(["one_time", "monthly", "yearly"]),
  projectId: z.union([z.string().uuid(), z.literal("")]).optional().transform((v) => v || null),
  note: z.string().trim().max(1000).optional(),
  // A card/bank account already saved on the donor's Stripe customer: charged directly, no card entry screen.
  paymentMethodId: z.string().regex(/^pm_[A-Za-z0-9]+$/).optional(),
}).refine((v) => v.donorId || (v.email && v.firstName?.trim() && v.lastName?.trim()), {
  message: "Enter the donor's name and email.",
});

/**
 * A staff-run "virtual terminal": for a donor giving by phone or mail, staff enter their name/email here and the
 * amount, then the donor's card or bank account number is typed directly into Stripe's own secure fields on the
 * next screen (PayForm) — it never passes through this server or our database, same as the public donate flow.
 */
/** Either a client secret for Stripe's card-entry screen, or — when a saved payment method was used — the charge result. */
export type AdminChargeResult = CheckoutResult | { ok: true; donationId: string; charged: "succeeded" | "processing" };

export async function startAdminCharge(raw: unknown): Promise<AdminChargeResult> {
  const { user, perms } = await requirePermission("finance.view");
  if (!perms.has("expenses.record")) return { ok: false, error: "Your role can view finance data but cannot record entries." };
  if (!isStripeConfigured()) return { ok: false, error: "Payments are not configured yet." };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const input = parsed.data;

  const settings = await getOrgSettings();
  let amountCents: number;
  try { amountCents = Math.round(parseFloat(input.amount) * 100); } catch { return { ok: false, error: "Enter a valid amount." }; }
  const amountErr = validateDonationAmount(amountCents, settings.min_donation_cents, settings.max_donation_cents);
  if (amountErr) return { ok: false, error: amountErr };

  const db = createSupabaseAdminClient();

  let fundId: string | null = null;
  let projectId: string | null = null;
  if (input.projectId) {
    const { data: project } = await db.from("projects").select("id, fund_id").eq("id", input.projectId).maybeSingle();
    if (!project) return { ok: false, error: "That project was not found." };
    projectId = project.id; fundId = project.fund_id;
  }
  if (!fundId) {
    const { data: general } = await db.from("funds").select("id").eq("key", "general").single();
    fundId = general?.id ?? null;
  }

  // Donor: an existing record when started from that donor's own page, otherwise matched/created by email
  // like any other admin-entered gift (see recordOfflineGift). A new donor gets no linked account.
  let donor: { id: string; stripe_customer_id: string | null; email: string; first_name: string; last_name: string } | null = null;
  if (input.donorId) {
    const { data } = await db.from("donor_profiles").select("id, stripe_customer_id, email, first_name, last_name").eq("id", input.donorId).is("deleted_at", null).maybeSingle();
    if (!data) return { ok: false, error: "Donor not found." };
    donor = data;
  } else {
    const normalized = input.email!;
    const { data } = await db.from("donor_profiles").select("id, stripe_customer_id, email, first_name, last_name").eq("normalized_email", normalized).maybeSingle();
    donor = data;
    if (!donor) {
      const ins = await db.from("donor_profiles")
        .insert({ email: input.email, normalized_email: normalized, first_name: input.firstName, last_name: input.lastName, phone: input.phone || null })
        .select("id, stripe_customer_id, email, first_name, last_name").single();
      if (ins.error) return { ok: false, error: "Could not save the donor's details." };
      donor = ins.data;
    }
  }

  const stripe = getStripe();
  let customerId = donor.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create(
      { email: isPlaceholderEmail(donor.email) ? undefined : donor.email, name: `${donor.first_name} ${donor.last_name}`, metadata: { donor_id: donor.id } },
      { idempotencyKey: `cust-${donor.id}` },
    );
    customerId = customer.id;
    await db.from("donor_profiles").update({ stripe_customer_id: customerId }).eq("id", donor.id);
  }

  // A saved payment method must belong to this donor's own Stripe customer.
  let savedPm: import("stripe").Stripe.PaymentMethod | null = null;
  if (input.paymentMethodId) {
    if (!input.donorId) return { ok: false, error: "Saved payment methods can only be used from a donor's record." };
    savedPm = await stripe.paymentMethods.retrieve(input.paymentMethodId).catch(() => null);
    const owner = typeof savedPm?.customer === "string" ? savedPm.customer : savedPm?.customer?.id;
    if (!savedPm || owner !== customerId || !["card", "us_bank_account", "link"].includes(savedPm.type)) {
      return { ok: false, error: "That saved payment method was not found for this donor." };
    }
  }

  const idempotencyKey = crypto.randomUUID();
  const base = {
    donor_id: donor.id, fund_id: fundId, project_id: projectId, tier_id: null,
    amount_cents: amountCents, currency: settings.currency, frequency: input.frequency,
    payment_method: (savedPm?.type === "us_bank_account" ? "us_bank_account" : "card") as "card" | "us_bank_account", status: "pending" as const, anonymous: false,
    donor_note: input.note ? `${input.note} (entered by staff)` : "Entered by staff (phone/mail gift)", idempotency_key: idempotencyKey,
  };
  const donationIns = await db.from("donations").insert(base).select("id").single();
  if (donationIns.error) return { ok: false, error: "Could not start this gift. Please try again." };
  const donationId = donationIns.data.id;
  await audit(user.id, "financial.adjustment", "donation", donationId, { op: "admin_charge_start", amount_cents: amountCents, frequency: input.frequency, saved_payment_method: !!savedPm });

  if (savedPm) {
    const r = await chargeSaved({ stripe, db, savedPm, customerId, donorId: donor.id, donationId, idempotencyKey, amountCents, fundId, projectId, frequency: input.frequency, currency: settings.currency, staffId: user.id });
    if (r.ok) await reconcileDonation(donationId); // record it now instead of waiting for the webhook
    return r;
  }

  try {
    if (input.frequency === "one_time") {
      const pi = await stripe.paymentIntents.create({
        amount: amountCents, currency: settings.currency.toLowerCase(), customer: customerId,
        // New details entered by staff are card only: Stripe's bank window offers a "Continue with Link" sign-in that
        // remembers a previous donor on this computer. Bank gifts by phone: add the account on the donor's Accounts tab
        // (typed numbers, verified by micro-deposits), then charge it here as a saved method.
        payment_method_types: ["card"], description: "Donation to Ultimate Mission (staff-assisted)",
        metadata: { donation_id: donationId, entered_by_staff: user.id },
      }, { idempotencyKey: `pi-${idempotencyKey}` });
      await db.from("donations").update({ stripe_payment_intent_id: pi.id }).eq("id", donationId);
      return { ok: true, donationId, clientSecret: pi.client_secret! };
    }

    const productId = await getDonationProductId(
      async () => ((await getSetting("stripe_donation_product_id")) as string | null),
      (id) => setSetting("stripe_donation_product_id", id, null),
    );
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price_data: { currency: settings.currency.toLowerCase(), product: productId, unit_amount: amountCents, recurring: { interval: input.frequency === "monthly" ? "month" : "year" } } }],
      payment_behavior: "default_incomplete",
      payment_settings: { payment_method_types: ["card"], save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.confirmation_secret"],
      metadata: { donation_id: donationId, entered_by_staff: user.id },
    }, { idempotencyKey: `sub-${idempotencyKey}` });

    const invoice = sub.latest_invoice as import("stripe").Stripe.Invoice;
    const rec = await db.from("recurring_donations").insert({
      donor_id: donor.id, fund_id: fundId, project_id: projectId, tier_id: null,
      amount_cents: amountCents, currency: settings.currency, frequency: input.frequency,
      status: "incomplete", stripe_subscription_id: sub.id, stripe_customer_id: customerId,
    }).select("id").single();
    if (rec.error) throw new Error("recurring insert failed");
    await db.from("donations").update({ recurring_id: rec.data.id, stripe_invoice_id: invoice.id }).eq("id", donationId);
    const secret = invoice.confirmation_secret?.client_secret;
    if (!secret) throw new Error("missing client secret");
    return { ok: true, donationId, clientSecret: secret };
  } catch (err) {
    await db.from("donations").update({ status: "failed" }).eq("id", donationId);
    console.error("[virtual-terminal] stripe error", err instanceof Error ? err.name : "unknown");
    return { ok: false, error: "We could not start this payment. The donor has not been charged." };
  }
}

/**
 * Charges a payment method already saved on the donor's Stripe customer, without the card-entry screen. Staff-initiated
 * with the donor's permission on the phone, so it is confirmed off-session. As with every gift, the donation and
 * recurring rows are finalized by Stripe webhooks; this only reports the immediate result to staff.
 */
async function chargeSaved(a: {
  stripe: import("stripe").Stripe; db: ReturnType<typeof createSupabaseAdminClient>; savedPm: import("stripe").Stripe.PaymentMethod;
  customerId: string; donorId: string; donationId: string; idempotencyKey: string; amountCents: number;
  fundId: string | null; projectId: string | null; frequency: "one_time" | "monthly" | "yearly"; currency: string; staffId: string;
}): Promise<AdminChargeResult> {
  const { stripe, db, savedPm, donationId } = a;
  const types = [savedPm.type as "card" | "us_bank_account" | "link"];
  try {
    if (a.frequency === "one_time") {
      const pi = await stripe.paymentIntents.create({
        amount: a.amountCents, currency: a.currency.toLowerCase(), customer: a.customerId, payment_method: savedPm.id,
        payment_method_types: types, confirm: true, off_session: true, description: "Donation to Ultimate Mission (staff-assisted, saved payment method)",
        metadata: { donation_id: donationId, entered_by_staff: a.staffId },
      }, { idempotencyKey: `pi-${a.idempotencyKey}` });
      await db.from("donations").update({ stripe_payment_intent_id: pi.id }).eq("id", donationId);
      if (pi.status === "succeeded") return { ok: true, donationId, charged: "succeeded" };
      if (pi.status === "processing") return { ok: true, donationId, charged: "processing" };
      throw Object.assign(new Error("not completed"), { code: pi.status });
    }

    const productId = await getDonationProductId(
      async () => ((await getSetting("stripe_donation_product_id")) as string | null),
      (id) => setSetting("stripe_donation_product_id", id, null),
    );
    const sub = await stripe.subscriptions.create({
      customer: a.customerId, default_payment_method: savedPm.id, off_session: true,
      items: [{ price_data: { currency: a.currency.toLowerCase(), product: productId, unit_amount: a.amountCents, recurring: { interval: a.frequency === "monthly" ? "month" : "year" } } }],
      // A card is charged now and the gift isn't created if it's declined; a bank debit takes days, so it may start incomplete.
      payment_behavior: savedPm.type === "card" ? "error_if_incomplete" : "allow_incomplete",
      payment_settings: { payment_method_types: types },
      metadata: { donation_id: donationId, entered_by_staff: a.staffId },
    }, { idempotencyKey: `sub-${a.idempotencyKey}` });
    const invoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id ?? null;
    const rec = await db.from("recurring_donations").insert({
      donor_id: a.donorId, fund_id: a.fundId, project_id: a.projectId, tier_id: null,
      amount_cents: a.amountCents, currency: a.currency, frequency: a.frequency,
      status: sub.status === "active" ? "active" : "incomplete", stripe_subscription_id: sub.id, stripe_customer_id: a.customerId,
    }).select("id").single();
    if (rec.error) throw new Error("recurring insert failed");
    await db.from("donations").update({ recurring_id: rec.data.id, stripe_invoice_id: invoiceId }).eq("id", donationId);
    return { ok: true, donationId, charged: sub.status === "active" && savedPm.type === "card" ? "succeeded" : "processing" };
  } catch (err) {
    await db.from("donations").update({ status: "failed" }).eq("id", donationId);
    const e = err as { type?: string; code?: string; message?: string };
    console.error("[virtual-terminal] saved charge failed", e.type ?? "unknown", e.code ?? "");
    if (e.code === "authentication_required" || e.code === "requires_action") {
      return { ok: false, error: "The card's bank wants the donor to approve this payment, which can't be done by phone. Choose \"Enter a new card or bank account\" instead. The donor has not been charged." };
    }
    if (e.type === "StripeCardError") return { ok: false, error: `The payment was declined: ${e.message ?? "card declined"}. The donor has not been charged.` };
    return { ok: false, error: "We could not charge the saved payment method. The donor has not been charged." };
  }
}
