import { z } from "zod";
import { dollarsToCents } from "@/lib/money";

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const text = (max: number) => z.string().trim().max(max);
const optionalUrl = z.string().trim().max(300).refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Must start with https://");
const dollars = (label: string) => z.string().trim().transform((v, ctx) => {
  try { return dollarsToCents(v); } catch { ctx.addIssue({ code: "custom", message: `${label}: enter an amount like 5 or 5.00` }); return z.NEVER; }
});
const validZone = (tz: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };

/**
 * Only these keys are editable through the settings form (explicit allow-list). Guest donations are deliberately
 * absent: the option exists in the database but guest checkout is not implemented, so it must not be switchable.
 * Multi-currency is likewise fixed to USD until payments, receipts and reporting all support it.
 */
export const settingsSchema = z.object({
  legal_name: text(150).min(1, "Enter the legal organization name"),
  brand_name: text(80).min(1, "Enter the public brand name"),
  ein: z.string().trim().refine((v) => v === "" || /^\d{2}-?\d{7}$/.test(v), "EIN must look like 12-3456789").transform((v) => (v && !v.includes("-") ? `${v.slice(0, 2)}-${v.slice(2)}` : v)),
  mailing_address: text(300), phone: text(40),
  contact_email: z.string().trim().max(200).refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid contact email"),
  website: optionalUrl, logo_url: optionalUrl,
  timezone: z.string().trim().refine(validZone, "Unknown time zone"),
  fiscal_year_start_month: z.coerce.number().int().min(1).max(12),
  receipt_language: text(2000), tax_acknowledgment: text(2000), no_goods_or_services_statement: text(1000),
  default_thank_you: text(1000).min(1, "Enter a default thank-you message"),
  social_facebook: optionalUrl, social_youtube: optionalUrl, social_twitter: optionalUrl,
  custom_amount_enabled: checkbox, public_recognition_enabled: checkbox, recurring_amount_change_enabled: checkbox,
  min_donation: dollars("Minimum donation"), max_donation: dollars("Maximum donation"),
  email_sender_name: text(80).min(1, "Enter a sender name"),
  email_reply_to: z.string().trim().max(200).refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid reply-to email"),
  data_retention_years: z.coerce.number().int().min(1).max(50),
}).superRefine((v, ctx) => {
  if (v.min_donation < 100) ctx.addIssue({ code: "custom", path: ["min_donation"], message: "Minimum donation must be at least $1.00" });
  if (v.max_donation < v.min_donation) ctx.addIssue({ code: "custom", path: ["max_donation"], message: "Maximum must be at least the minimum" });
});
export type SettingsInput = z.infer<typeof settingsSchema>;

/** Flattens validated input to the stored key/value pairs (amounts stored as cents). */
export function settingsToEntries(s: SettingsInput): Record<string, unknown> {
  const { min_donation, max_donation, ...rest } = s;
  return { ...rest, min_donation_cents: min_donation, max_donation_cents: max_donation, currency: "USD" };
}
