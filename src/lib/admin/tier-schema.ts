import { z } from "zod";
import { dollarsToCents } from "@/lib/money";

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const optionalDate = z.string().trim().optional().transform((v, ctx) => {
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) { ctx.addIssue({ code: "custom", message: "Enter a valid date" }); return z.NEVER; }
  return new Date(t).toISOString();
});

export const tierSchema = z.object({
  internal_name: z.string().trim().min(1, "Enter an internal name").max(80),
  public_title: z.string().trim().min(1, "Enter a public title").max(80),
  amount: z.string().trim().transform((v, ctx) => {
    try { return dollarsToCents(v); } catch { ctx.addIssue({ code: "custom", message: "Enter an amount like 25 or 25.50" }); return z.NEVER; }
  }).pipe(z.number().int().min(100, "Minimum tier amount is $1.00").max(100_000_000, "Amount is too large")),
  short_description: optionalText(300),
  impact_description: optionalText(2000),
  confirmation_message: optionalText(2000),
  email_message: optionalText(4000),
  image_url: z.string().trim().optional().transform((v) => v || null)
    .refine((v) => v === null || /^https:\/\/[^\s]+$/.test(v), "Image must be an https:// URL"),
  allow_one_time: checkbox, allow_monthly: checkbox, allow_yearly: checkbox,
  general_fund: checkbox,
  project_id: z.string().trim().optional().transform((v) => v || null).pipe(z.string().uuid().nullable()),
  featured: checkbox,
  display_order: z.coerce.number().int().min(0).max(10000).default(0),
  active_from: optionalDate, active_until: optionalDate,
  status: z.enum(["active", "inactive", "archived"]),
}).superRefine((v, ctx) => {
  if (!v.allow_one_time && !v.allow_monthly && !v.allow_yearly) ctx.addIssue({ code: "custom", path: ["allow_one_time"], message: "Offer this tier for at least one frequency" });
  if (!v.general_fund && !v.project_id) ctx.addIssue({ code: "custom", path: ["general_fund"], message: "Offer this tier for the General Fund or choose a project" });
  if (v.active_from && v.active_until && v.active_until <= v.active_from) ctx.addIssue({ code: "custom", path: ["active_until"], message: "End date must be after the start date" });
});

export type TierInput = z.infer<typeof tierSchema>;

/** Maps validated form data to the database columns (explicit allow-list: no mass assignment). */
export function tierToRow(t: TierInput) {
  return {
    internal_name: t.internal_name, public_title: t.public_title, amount_cents: t.amount,
    short_description: t.short_description, impact_description: t.impact_description,
    confirmation_message: t.confirmation_message, email_message: t.email_message, image_url: t.image_url,
    allow_one_time: t.allow_one_time, allow_monthly: t.allow_monthly, allow_yearly: t.allow_yearly,
    general_fund: t.general_fund, project_id: t.project_id, featured: t.featured,
    display_order: t.display_order, active_from: t.active_from, active_until: t.active_until, status: t.status,
  };
}
