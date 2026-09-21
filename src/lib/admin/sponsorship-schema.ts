import { z } from "zod";
import { dollarsToCents } from "@/lib/money";
import { slugify } from "./project-schema";

export const SPONSOR_DESCRIPTION_MAX = 1500;

export const sponsorshipSchema = z.object({
  name: z.string().trim().min(1, "Enter her name").max(80),
  country: z.string().trim().max(80).optional().transform((v) => v || null),
  description: z.string().trim().max(SPONSOR_DESCRIPTION_MAX).optional().transform((v) => v || null),
  amount: z.string().trim().transform((v, ctx) => {
    try { return dollarsToCents(v); } catch { ctx.addIssue({ code: "custom", message: "Enter the monthly amount, like 80 or 80.00" }); return z.NEVER; }
  }).pipe(z.number().int().min(500, "The minimum is $5.00").max(100000, "The maximum is $1,000.00")),
  status: z.enum(["active", "inactive", "archived"]),
  display_order: z.coerce.number().int().min(0).max(10000).default(0),
});
export type SponsorshipInput = z.infer<typeof sponsorshipSchema>;

/** Explicit column allow-list (no mass assignment). */
export const sponsorshipToRow = (s: SponsorshipInput) => ({
  name: s.name, country: s.country, description: s.description, monthly_amount_cents: s.amount, status: s.status, display_order: s.display_order,
});

export const sponsorshipSlug = (name: string, suffix: string) => `${slugify(name) || "sponsor"}-${suffix}`.slice(0, 80);
