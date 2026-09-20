import "server-only";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const donorQuerySchema = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(["active", "inactive", "lapsed", "do_not_contact"]).optional(),
  tag: z.string().uuid().optional(),
  recurring: z.enum(["yes", "no"]).optional(),
  min: z.coerce.number().min(0).max(10_000_000).optional(),
  sort: z.enum(["name", "lifetime", "last_gift", "created"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
});
export type DonorQuery = z.infer<typeof donorQuerySchema>;
export const DONOR_PAGE_SIZE = 25;

/** Removes characters that carry meaning in PostgREST filter strings so user text can't alter the query structure. */
export const safeSearch = (q: string) => q.replace(/[,()%*\\:"'`]/g, " ").trim();

const SORTS = { name: "last_name", lifetime: "lifetime_cents", last_gift: "last_gift_at", created: "created_at" } as const;

/** Callers must have passed requirePermission("donors.view"). */
export async function queryDonors(query: DonorQuery, opts: { all?: boolean } = {}) {
  const db = createSupabaseAdminClient();
  let taggedIds: string[] | null = null;
  if (query.tag) {
    const { data } = await db.from("donor_tag_assignments").select("donor_id").eq("tag_id", query.tag);
    taggedIds = (data ?? []).map((r) => r.donor_id);
    if (taggedIds.length === 0) return { rows: [], total: 0 };
  }

  let q = db.from("donor_summary").select("*", { count: "exact" });
  const term = query.q ? safeSearch(query.q) : "";
  if (term) q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`);
  if (query.status) q = q.eq("status", query.status);
  if (taggedIds) q = q.in("id", taggedIds);
  if (query.recurring === "yes") q = q.gt("active_recurring", 0);
  if (query.recurring === "no") q = q.eq("active_recurring", 0);
  if (query.min !== undefined) q = q.gte("lifetime_cents", Math.round(query.min * 100));
  q = q.order(SORTS[query.sort], { ascending: query.dir === "asc", nullsFirst: false }).order("id");
  if (!opts.all) q = q.range((query.page - 1) * DONOR_PAGE_SIZE, query.page * DONOR_PAGE_SIZE - 1);
  else q = q.limit(20000);

  const { data, count, error } = await q;
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}
