import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { DonorFacts } from "./audience";

const SETTLED = ["succeeded", "partially_refunded", "refunded"];

/**
 * Builds the facts needed to select an audience. Callers MUST have passed requirePermission("comms.send").
 * Loaded in memory (up to 20,000 donors); move to SQL if the donor base grows well beyond that.
 */
export async function loadAudienceData(): Promise<{ donors: DonorFacts[]; suppressed: Set<string> }> {
  const db = createSupabaseAdminClient();
  const [summary, regions, prefs, recurring, gifts, tags, supp] = await Promise.all([
    db.from("donor_summary").select("id, email, first_name, last_name, status, lifetime_cents, last_gift_at").limit(20000),
    db.from("donor_profiles").select("id, region").is("deleted_at", null).limit(20000),
    db.from("communication_preferences").select("donor_id, marketing_email, project_updates, suppressed").limit(20000),
    db.from("recurring_donations").select("donor_id, frequency").eq("status", "active").limit(50000),
    db.from("donations").select("donor_id, project_id").not("project_id", "is", null).in("status", SETTLED).limit(100000),
    db.from("donor_tag_assignments").select("donor_id, tag_id").limit(100000),
    db.from("email_suppressions").select("email").limit(100000),
  ]);
  if (summary.error) throw new Error(summary.error.message);

  const region = new Map((regions.data ?? []).map((r) => [r.id, r.region as string | null]));
  const pref = new Map((prefs.data ?? []).map((p) => [p.donor_id, p]));
  const freq = new Map<string, Set<string>>();
  for (const r of recurring.data ?? []) (freq.get(r.donor_id) ?? freq.set(r.donor_id, new Set()).get(r.donor_id)!).add(r.frequency);
  const proj = new Map<string, Set<string>>();
  for (const g of gifts.data ?? []) (proj.get(g.donor_id) ?? proj.set(g.donor_id, new Set()).get(g.donor_id)!).add(g.project_id);
  const tg = new Map<string, Set<string>>();
  for (const t of tags.data ?? []) (tg.get(t.donor_id) ?? tg.set(t.donor_id, new Set()).get(t.donor_id)!).add(t.tag_id);

  const donors: DonorFacts[] = (summary.data ?? []).map((d) => {
    const p = pref.get(d.id);
    return {
      id: d.id, email: d.email ?? "", first_name: d.first_name, last_name: d.last_name, region: region.get(d.id) ?? null, status: d.status,
      // No preference row means the donor never opted in: default to NOT contactable.
      marketing_email: p?.marketing_email ?? false, project_updates: p?.project_updates ?? false, suppressed: p?.suppressed ?? false,
      lifetime_cents: Number(d.lifetime_cents), last_gift_at: d.last_gift_at,
      active_monthly: freq.get(d.id)?.has("monthly") ?? false, active_yearly: freq.get(d.id)?.has("yearly") ?? false,
      project_ids: [...(proj.get(d.id) ?? [])], tag_ids: [...(tg.get(d.id) ?? [])],
    };
  });
  return { donors, suppressed: new Set((supp.data ?? []).map((s) => String(s.email).toLowerCase())) };
}
