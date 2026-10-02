import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { getOrgSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { renderDonationMessage, type TemplateVars } from "@/lib/messages";
import { donorFacingDesignation } from "./designation-label";
import { publicEnv } from "@/lib/env";
import type { NotifyKind } from "@/lib/stripe/handlers";
import { logCommunication, type CommunicationKind } from "@/lib/comms/log";

const TEMPLATE_KEY: Record<NotifyKind, (frequency: string) => string> = {
  donation_success: (f) => (f === "one_time" ? "donation_success_one_time" : "donation_success_recurring"),
  ach_confirmed: () => "ach_confirmed",
  payment_failed: () => "payment_failed",
  recurring_canceled: () => "recurring_canceled",
  refund_issued: () => "refund_issued",
};

/** How each transactional email shows on the donor's Contacts tab. A success email is the receipt and thank-you in one. */
const LOG_KIND: Record<NotifyKind, CommunicationKind> = {
  donation_success: "receipt", ach_confirmed: "receipt", payment_failed: "payment_failed", recurring_canceled: "recurring_canceled", refund_issued: "refund",
};

const FREQ_LABEL: Record<string, string> = { one_time: "one-time", monthly: "monthly", yearly: "yearly" };

/**
 * The template an automatic email uses: the one assigned to it under Messages → "Used for" (message_assignments),
 * otherwise the template whose key matches the event (original seeded behaviour). None means no email is sent.
 */
async function loadTemplateFor(event: string) {
  const db = createSupabaseAdminClient();
  const assigned = await db.from("message_assignments").select("message_templates(subject, body_html, body_text)").eq("event", event).maybeSingle();
  const t = assigned.error ? null : assigned.data?.message_templates;
  const viaAssignment = Array.isArray(t) ? t[0] : t;
  if (viaAssignment) return { data: viaAssignment as { subject: string; body_html: string; body_text: string } };
  return db.from("message_templates").select("subject, body_html, body_text").eq("key", event).maybeSingle();
}

/** Transactional email tied to a donation. Independent of marketing consent by design. */
export async function notifyDonor(kind: NotifyKind, ref: { donationId?: string; recurringId?: string }) {
  const db = createSupabaseAdminClient();
  const settings = await getOrgSettings();

  const donationId = ref.donationId;
  let recurring: { donor_id: string; amount_cents: number; frequency: string; tier_id: string | null; project_id: string | null } | null = null;
  if (!donationId && ref.recurringId) {
    const { data } = await db.from("recurring_donations").select("donor_id, amount_cents, frequency, tier_id, project_id").eq("id", ref.recurringId).single();
    recurring = data;
  }

  const donation = donationId
    ? (await db.from("donations").select("donor_id, amount_cents, frequency, tier_id, project_id, donated_at, receipts(receipt_number)").eq("id", donationId).single()).data
    : null;
  const src = donation ?? recurring;
  if (!src) return;

  const [{ data: donor }, { data: tier }, { data: project }, { data: template }] = await Promise.all([
    db.from("donor_profiles").select("email, first_name, last_name").eq("id", src.donor_id).single(),
    src.tier_id ? db.from("donation_tiers").select("public_title, email_message").eq("id", src.tier_id).maybeSingle() : Promise.resolve({ data: null }),
    src.project_id ? db.from("projects").select("title, kind").eq("id", src.project_id).maybeSingle() : Promise.resolve({ data: null }),
    loadTemplateFor(TEMPLATE_KEY[kind](src.frequency)),
  ]);
  if (!donor || !template) return;

  const receipts = (donation as { receipts?: { receipt_number: string }[] | { receipt_number: string } | null } | null)?.receipts;
  const receiptNumber = Array.isArray(receipts) ? receipts[0]?.receipt_number : receipts?.receipt_number;
  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  const vars: TemplateVars = {
    donor_first_name: donor.first_name, donor_full_name: `${donor.first_name} ${donor.last_name}`,
    donation_amount: formatMoney(src.amount_cents, settings.currency),
    donation_date: new Date((donation?.donated_at as string | undefined) ?? Date.now()).toLocaleDateString("en-US"),
    donation_frequency: FREQ_LABEL[src.frequency] ?? src.frequency,
    tier_name: tier?.public_title ?? "", project_name: donorFacingDesignation(project),
    receipt_number: receiptNumber ?? "", organization_name: settings.brand_name,
    dashboard_link: `${base}/dashboard`, receipt_link: donationId ? `${base}/receipts/${donationId}/pdf` : `${base}/dashboard`,
  };
  // Tier override applies to success emails only, so failures/refunds keep their required wording.
  const override = kind === "donation_success" || kind === "ach_confirmed" ? tier?.email_message : null;
  const msg = renderDonationMessage(template, override, vars);
  const sent = await sendEmail({ to: donor.email, ...msg, fromName: settings.email_sender_name, replyTo: settings.email_reply_to || undefined, tags: [{ name: "kind", value: kind }] });
  await logCommunication({
    donorId: src.donor_id, kind: LOG_KIND[kind], subject: msg.subject, donationId: donationId ?? null,
    templateKey: TEMPLATE_KEY[kind](src.frequency), status: sent.skipped ? "skipped" : "sent",
  });
}
