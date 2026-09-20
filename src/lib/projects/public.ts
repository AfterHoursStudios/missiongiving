import "server-only";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgSettings } from "@/lib/settings";
import { projectProgress } from "@/lib/money";

const LIST_COLS = "id, slug, title, summary, featured_image_url, location, goal_cents, offline_adjustment_cents, start_date, end_date, status, featured";

export interface PublicProject {
  id: string; slug: string; title: string; summary: string | null; featured_image_url: string | null; location: string | null;
  goal_cents: number | null; start_date: string | null; end_date: string | null; status: string; featured: boolean;
  raised: number; pct: number | null; donors: number;
}

async function withTotals<T extends { id: string; goal_cents: number | null; offline_adjustment_cents: number }>(rows: T[]) {
  const supabase = await createSupabaseServerClient();
  return Promise.all(rows.map(async (p) => {
    const { data } = await supabase.rpc("project_totals", { p_project_id: p.id });
    const raisedConfirmed = Number(data?.[0]?.raised_cents ?? 0);
    const pr = projectProgress(raisedConfirmed, p.offline_adjustment_cents, p.goal_cents);
    return { ...p, raised: pr.raised, pct: pr.pct, donors: Number(data?.[0]?.donor_count ?? 0) };
  }));
}

/** Uses the anonymous-role client, so Row Level Security (not application code) decides what is public. */
export async function listPublicProjects(): Promise<PublicProject[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("projects").select(LIST_COLS).order("featured", { ascending: false }).order("created_at", { ascending: false });
  return (await withTotals(data ?? [])) as unknown as PublicProject[];
}

export async function getPublicProject(slug: string) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("projects")
    .select(`${LIST_COLS}, story_html, gallery, seo_title, seo_description, share_image_url, allow_custom_amount`).eq("slug", slug).maybeSingle();
  if (!data) return null;
  const [project] = await withTotals([data]);
  const { data: updates } = await supabase.from("project_updates").select("id, title, body_html, published_at")
    .eq("project_id", data.id).not("published_at", "is", null).order("published_at", { ascending: false });
  return { project, updates: updates ?? [] };
}

/**
 * Consent-based recognition: first name and last initial only, for donors who opted in, gifts not marked anonymous,
 * and only when the organization has enabled public recognition. Uses the service role because donor rows are private.
 */
export async function recentRecognition(projectId: string): Promise<string[]> {
  if (!(await getOrgSettings()).public_recognition_enabled) return [];
  const { data } = await createSupabaseAdminClient().from("donations")
    .select("donor_profiles!inner(first_name, last_name, public_recognition)")
    .eq("project_id", projectId).eq("anonymous", false).in("status", ["succeeded", "partially_refunded"])
    .eq("donor_profiles.public_recognition", true).order("donated_at", { ascending: false }).limit(8);
  const names = (data ?? []).map((d) => {
    const p = Array.isArray(d.donor_profiles) ? d.donor_profiles[0] : d.donor_profiles;
    return p ? `${p.first_name} ${p.last_name.charAt(0)}.` : "";
  }).filter(Boolean);
  return [...new Set(names)];
}
