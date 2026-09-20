import { z } from "zod";
import { dollarsToCents } from "@/lib/money";

const money = (label: string) => z.string().trim().transform((v, ctx) => {
  try { const c = dollarsToCents(v); if (c <= 0) throw new Error(); return c; } catch { ctx.addIssue({ code: "custom", message: `${label}: enter an amount like 100 or 100.50` }); return z.NEVER; }
});

export const OFFLINE_METHODS = ["check", "cash", "wire", "other"] as const;

export const offlineGiftSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter the donor's email"),
  first_name: z.string().trim().max(80).optional().transform((v) => v || null),
  last_name: z.string().trim().max(80).optional().transform((v) => v || null),
  amount: money("Amount").pipe(z.number().max(100_000_000, "Amount is too large")),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date received").refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date"),
  project_id: z.string().trim().optional().transform((v) => v || null).pipe(z.string().uuid().nullable()),
  method: z.enum(OFFLINE_METHODS),
  reference: z.string().trim().max(60).optional().transform((v) => v || null),
  send_receipt: z.preprocess((v) => v === "on", z.boolean()),
}).superRefine((v, ctx) => {
  // received date can't be in the future (allow one day of time-zone slack)
  if (Date.parse(v.date) > Date.now() + 86_400_000) ctx.addIssue({ code: "custom", path: ["date"], message: "The received date cannot be in the future" });
});

export const refundSchema = z.object({
  donationId: z.string().uuid(), amount: money("Refund amount"), reason: z.string().trim().min(3, "Give a reason").max(300),
});

export interface RefundTarget { status: string; payment_method: string; amount_cents: number; refunded_cents: number; has_payment_intent: boolean }

/** Returns an error message, or null when the refund may be submitted to Stripe. */
export function validateRefund(d: RefundTarget, requestedCents: number): string | null {
  if (d.payment_method === "offline") return "Offline gifts are refunded outside this system (return the check or cash), then adjust records manually.";
  if (!d.has_payment_intent) return "This donation has no Stripe payment to refund.";
  if (!["succeeded", "partially_refunded"].includes(d.status)) return "Only settled gifts can be refunded. Pending bank payments must settle first.";
  const remaining = d.amount_cents - d.refunded_cents;
  if (remaining <= 0) return "This gift has already been fully refunded.";
  if (requestedCents > remaining) return `The most that can still be refunded is ${(remaining / 100).toFixed(2)}.`;
  return null;
}
