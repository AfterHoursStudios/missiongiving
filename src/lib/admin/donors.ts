import "server-only";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const donorQuerySchema = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(["active", "inactive", "lapsed", "do_not_contact"]).optional(),
  tag: z.string().uuid().optional(),
  recurring: z.enum(["yes", "no"]).optional(),
  min: z.coerce.number().min(0).max(10_000_000).optional(),
  sort: z.enum(["name", "lifetime", "last_gift", "created", "score", "gifts"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
});
export type DonorQuery = z.infer<typeof donorQuerySchema>;
export const DONOR_PAGE_SIZE = 25;

/** Removes characters that carry meaning in PostgREST filter strings so user text can't alter the query structure. */
export const safeSearch = (q: string) => q.replace(/[,()%*\\:"'`]/g, " ").trim();

/** Sort columns: combined DonorPerfect + Mission Giving figures (migration 0017), with the pre-0017 columns as fallback. */
const SORTS = { name: "last_name", lifetime: "total_given_cents", last_gift: "latest_gift_at", created: "created_at", score: "donor_score", gifts: "total_gifts" } as const;
const FALLBACK_SORTS: Record<string, string> = { total_given_cents: "lifetime_cents", latest_gift_at: "last_gift_at", total_gifts: "gift_count", donor_score: "last_name" };

/** Callers must have passed requirePermission("donors.view"). */
export async function queryDonors(query: DonorQuery, opts: { all?: boolean } = {}) {
  const db = createSupabaseAdminClient();
  let taggedIds: string[] | null = null;
  if (query.tag) {
    const { data } = await db.from("donor_tag_assignments").select("donor_id").eq("tag_id", query.tag);
    taggedIds = (data ?? []).map((r) => r.donor_id);
    if (taggedIds.length === 0) return { rows: [], total: 0 };
  }

  const run = (sortCol: string) => {
    let q = db.from("donor_summary").select("*", { count: "exact" });
    const term = query.q ? safeSearch(query.q) : "";
    if (term) q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,organization_name.ilike.%${term}%,dp_id.eq.${term}`);
    if (query.status) q = q.eq("status", query.status);
    if (taggedIds) q = q.in("id", taggedIds);
    if (query.recurring === "yes") q = q.gt("active_recurring", 0);
    if (query.recurring === "no") q = q.eq("active_recurring", 0);
    if (query.min !== undefined) q = q.gte("lifetime_cents", Math.round(query.min * 100));
    q = q.order(sortCol, { ascending: query.dir === "asc", nullsFirst: false }).order("last_name").order("id");
    return opts.all ? q.limit(20000) : q.range((query.page - 1) * DONOR_PAGE_SIZE, query.page * DONOR_PAGE_SIZE - 1);
  };
  let { data, count, error } = await run(SORTS[query.sort]);
  if (error && FALLBACK_SORTS[SORTS[query.sort]]) ({ data, count, error } = await run(FALLBACK_SORTS[SORTS[query.sort]]));
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}
