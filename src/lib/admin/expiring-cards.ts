import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { getOrgSettings } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { publicEnv } from "@/lib/env";
import { buildExpiringCardsDigest, isCardExpiringSoon, type ExpiringCardGift, type ExpiringCardRow } from "./expiring-cards-logic";

const WINDOW_DAYS = 30;

interface DonorRef { id: string; first_name: string; last_name: string; stripe_customer_id: string | null }

/**
 * Daily check: every donor with an active/past-due recurring gift, every card on file for that donor's Stripe
 * customer, flagged when it expires within WINDOW_DAYS. One digest email to the org contact address; nothing is
 * sent to donors here (that's a separate, donor-facing concern).
 */
export async function runExpiringCardsCheck(now = new Date()) {
  if (!isStripeConfigured()) return { donorsChecked: 0, cardsExpiring: 0, emailSent: false, skipped: "stripe not configured" };

  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("recurring_donations")
    .select("amount_cents, frequency, status, donor_profiles!inner(id, first_name, last_name, stripe_customer_id)")
    .in("status", ["active", "past_due"]);
  if (error) throw new Error(error.message);

  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
  const donors = new Map<string, { donor: DonorRef; gifts: ExpiringCardGift[] }>();
  for (const rec of data ?? []) {
    const donor = one<DonorRef>(rec.donor_profiles as DonorRef | DonorRef[] | null);
    if (!donor?.stripe_customer_id) continue;
    const entry = donors.get(donor.id) ?? { donor, gifts: [] };
    entry.gifts.push({ amountCents: rec.amount_cents, frequency: rec.frequency, status: rec.status });
    donors.set(donor.id, entry);
  }

  const stripe = getStripe();
  const rows: ExpiringCardRow[] = [];
  for (const { donor, gifts } of donors.values()) {
    let cards;
    try {
      cards = await stripe.paymentMethods.list({ customer: donor.stripe_customer_id!, type: "card" });
    } catch (e) {
      console.error("[expiring-cards] failed to list cards for a customer", e instanceof Error ? e.name : "unknown");
      continue;
    }
    for (const pm of cards.data) {
      if (!pm.card) continue;
      if (!isCardExpiringSoon(pm.card.exp_month, pm.card.exp_year, now, WINDOW_DAYS)) continue;
      rows.push({
        donorId: donor.id, donorName: `${donor.first_name} ${donor.last_name}`,
        brand: pm.card.brand.replace(/^\w/, (c) => c.toUpperCase()), last4: pm.card.last4,
        expMonth: pm.card.exp_month, expYear: pm.card.exp_year, gifts,
      });
    }
  }
  rows.sort((a, b) => a.expYear - b.expYear || a.expMonth - b.expMonth || a.donorName.localeCompare(b.donorName));

  const result = { donorsChecked: donors.size, cardsExpiring: rows.length, emailSent: false as boolean, skipped: undefined as string | undefined };
  if (rows.length === 0) return result;

  const settings = await getOrgSettings();
  if (!settings.contact_email) return { ...result, skipped: "no organization contact email configured" };

  const digest = buildExpiringCardsDigest(rows, { baseUrl: publicEnv.NEXT_PUBLIC_APP_URL, orgName: settings.brand_name, currency: settings.currency, windowDays: WINDOW_DAYS });
  if (!digest) return result;
  await sendEmail({
    to: settings.contact_email, subject: digest.subject, html: digest.html, text: digest.text,
    fromName: settings.email_sender_name, replyTo: settings.email_reply_to || undefined,
    tags: [{ name: "kind", value: "expiring_cards_digest" }],
  });
  return { ...result, emailSent: true };
}
