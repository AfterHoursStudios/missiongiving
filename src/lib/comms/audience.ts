import { z } from "zod";

export type CampaignKind = "announcement" | "project_update";

const uuid = z.string().uuid();
const optionalNumber = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().min(0).max(100_000_000).optional());

/** Audience filters. Everything is combined with AND; values inside one list (frequencies, projects, tags) are OR. */
export const audienceSchema = z.object({
  frequencies: z.array(z.enum(["monthly", "yearly"])).default([]),
  project_ids: z.array(uuid).max(50).default([]),          // previous donors of any of these projects
  lapsed_months: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : v), z.coerce.number().int().min(1).max(240).optional()),
  min_lifetime: optionalNumber,                            // dollars, lifetime net giving
  max_lifetime: optionalNumber,
  tag_ids: z.array(uuid).max(50).default([]),
  region: z.string().trim().max(80).optional().transform((v) => v || undefined),
}).superRefine((v, ctx) => {
  if (v.min_lifetime !== undefined && v.max_lifetime !== undefined && v.max_lifetime < v.min_lifetime)
    ctx.addIssue({ code: "custom", path: ["max_lifetime"], message: "Maximum giving must be at least the minimum" });
});
export type AudienceFilters = z.infer<typeof audienceSchema>;

export interface DonorFacts {
  id: string; email: string; first_name: string; last_name: string; region: string | null; status: string;
  marketing_email: boolean; project_updates: boolean; suppressed: boolean;
  lifetime_cents: number; last_gift_at: string | null; active_monthly: boolean; active_yearly: boolean;
  project_ids: string[]; tag_ids: string[];
}

export type ConsentBlock = "no_email" | "do_not_contact" | "suppressed" | "no_consent";

/**
 * The hard rules that protect donors. Checked when building the audience AND again immediately before each send.
 *  - Fundraising/news announcements need `marketing_email`; project updates need `project_updates`.
 *  - Suppressed (bounce/complaint/unsubscribe) and do-not-contact donors never receive campaign mail.
 * Transactional receipts are separate and never call this.
 */
export function consentBlock(
  f: Pick<DonorFacts, "email" | "status" | "marketing_email" | "project_updates" | "suppressed">,
  kind: CampaignKind, suppressedEmails: ReadonlySet<string>,
): ConsentBlock | null {
  if (!f.email) return "no_email";
  if (f.status === "do_not_contact") return "do_not_contact";
  if (f.suppressed || suppressedEmails.has(f.email.trim().toLowerCase())) return "suppressed";
  if (kind === "announcement" ? !f.marketing_email : !f.project_updates) return "no_consent";
  return null;
}

export interface AudienceResult {
  recipients: DonorFacts[];
  excluded: Record<ConsentBlock, number> & { not_matching: number };
}

export function selectRecipients(
  donors: DonorFacts[], filters: AudienceFilters, kind: CampaignKind, suppressedEmails: ReadonlySet<string>, now: Date,
): AudienceResult {
  const excluded = { no_email: 0, do_not_contact: 0, suppressed: 0, no_consent: 0, not_matching: 0 };
  const recipients: DonorFacts[] = [];
  const lapsedBefore = filters.lapsed_months ? new Date(now) : null;
  if (lapsedBefore && filters.lapsed_months) lapsedBefore.setUTCMonth(lapsedBefore.getUTCMonth() - filters.lapsed_months);
  const region = filters.region?.toLowerCase();

  for (const d of donors) {
    const block = consentBlock(d, kind, suppressedEmails);
    if (block) { excluded[block]++; continue; }
    const matches =
      (filters.frequencies.length === 0 || (filters.frequencies.includes("monthly") && d.active_monthly) || (filters.frequencies.includes("yearly") && d.active_yearly)) &&
      (filters.project_ids.length === 0 || d.project_ids.some((p) => filters.project_ids.includes(p))) &&
      (!lapsedBefore || (d.last_gift_at !== null && new Date(d.last_gift_at) < lapsedBefore)) &&
      (filters.min_lifetime === undefined || d.lifetime_cents >= Math.round(filters.min_lifetime * 100)) &&
      (filters.max_lifetime === undefined || d.lifetime_cents <= Math.round(filters.max_lifetime * 100)) &&
      (filters.tag_ids.length === 0 || d.tag_ids.some((t) => filters.tag_ids.includes(t))) &&
      (!region || (d.region ?? "").trim().toLowerCase() === region);
    if (matches) recipients.push(d); else excluded.not_matching++;
  }
  return { recipients, excluded };
}

/** Parses the audience part of a form (repeated checkboxes/selects arrive as multiple values). */
export function audienceFromForm(form: FormData) {
  return audienceSchema.safeParse({
    frequencies: form.getAll("frequencies").map(String), project_ids: form.getAll("project_ids").map(String).filter(Boolean),
    tag_ids: form.getAll("tag_ids").map(String).filter(Boolean),
    lapsed_months: form.get("lapsed_months") ?? undefined, min_lifetime: form.get("min_lifetime") ?? undefined,
    max_lifetime: form.get("max_lifetime") ?? undefined, region: form.get("region") ?? undefined,
  });
}
