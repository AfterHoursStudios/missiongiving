import { z } from "zod";
import { validateDonationAmount } from "@/lib/money";

export const FREQUENCIES = ["one_time", "monthly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const checkoutSchema = z.object({
  idempotencyKey: z.string().uuid(),
  destination: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("general") }),
    z.object({ kind: z.literal("project"), projectId: z.string().uuid() }),
    z.object({ kind: z.literal("sponsorship"), sponsorshipId: z.string().uuid() }),
  ]),
  frequency: z.enum(FREQUENCIES),
  tierId: z.string().uuid().nullable(),
  customAmountCents: z.number().int().positive().nullable(),
  donor: z.object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(30).optional().or(z.literal("")),
    address: z.object({
      line1: z.string().trim().max(120).optional(), city: z.string().trim().max(80).optional(),
      region: z.string().trim().max(80).optional(), postalCode: z.string().trim().max(20).optional(),
    }).optional(),
  }),
  anonymous: z.boolean(),
  marketingOptIn: z.boolean(),
  projectUpdatesOptIn: z.boolean(),
  dedication: z.object({
    kind: z.enum(["in_honor_of", "in_memory_of"]), name: z.string().trim().min(1).max(120),
    message: z.string().trim().max(500).optional(),
  }).nullable(),
  note: z.string().trim().max(1000).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface TierRow {
  id: string; amount_cents: number; status: string; project_id: string | null; general_fund: boolean;
  allow_one_time: boolean; allow_monthly: boolean; allow_yearly: boolean;
  active_from: string | null; active_until: string | null;
}
export interface Limits { min: number; max: number; customEnabled: boolean; projectAllowsCustom: boolean }

/**
 * The server, not the browser, decides the charge amount. A tier id resolves to the tier's stored amount;
 * a custom amount is only accepted when enabled and within limits.
 */
export function resolveAmount(
  input: Pick<CheckoutInput, "frequency" | "tierId" | "customAmountCents" | "destination">,
  tier: TierRow | null, limits: Limits, now = new Date(),
): { ok: true; amountCents: number; tierId: string | null } | { ok: false; error: string } {
  if (input.tierId) {
    if (!tier || tier.id !== input.tierId || tier.status !== "active") return { ok: false, error: "That donation level is not available." };
    if (tier.active_from && new Date(tier.active_from) > now) return { ok: false, error: "That donation level is not available yet." };
    if (tier.active_until && new Date(tier.active_until) < now) return { ok: false, error: "That donation level has ended." };
    const freqOk = { one_time: tier.allow_one_time, monthly: tier.allow_monthly, yearly: tier.allow_yearly }[input.frequency];
    if (!freqOk) return { ok: false, error: "That level is not offered for this frequency." };
    const destOk = input.destination.kind === "general"
      ? tier.general_fund && tier.project_id === null
      : tier.project_id === null ? true : input.destination.kind === "project" && tier.project_id === input.destination.projectId;
    if (!destOk) return { ok: false, error: "That level is not offered for this destination." };
    return { ok: true, amountCents: tier.amount_cents, tierId: tier.id };
  }
  if (!limits.customEnabled || !limits.projectAllowsCustom) return { ok: false, error: "Please choose one of the listed amounts." };
  if (input.customAmountCents == null) return { ok: false, error: "Enter an amount." };
  const err = validateDonationAmount(input.customAmountCents, limits.min, limits.max);
  return err ? { ok: false, error: err } : { ok: true, amountCents: input.customAmountCents, tierId: null };
}

/**
 * Sponsorship gifts use the woman's fixed monthly amount, decided on the server (never the browser). Monthly or one-time only.
 */
export function resolveSponsorship(
  frequency: Frequency, sponsorship: { status: string; monthly_amount_cents: number } | null,
): { ok: true; amountCents: number; tierId: null } | { ok: false; error: string } {
  if (!sponsorship || sponsorship.status !== "active") return { ok: false, error: "This sponsorship is not available." };
  if (frequency === "yearly") return { ok: false, error: "Sponsorships can be given monthly or as a one-time gift." };
  return { ok: true, amountCents: sponsorship.monthly_amount_cents, tierId: null };
}
