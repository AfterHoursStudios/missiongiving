import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  const entries: MetadataRoute.Sitemap = ["", "/donate", "/projects", "/about"].map((p) => ({ url: `${base}${p}` }));
  if (!isSupabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return entries;
  try {
    const { data } = await createSupabaseAdminClient().from("projects").select("slug, updated_at")
      .eq("is_public", true).in("status", ["active", "goal_reached", "completed"]);
    for (const p of data ?? []) entries.push({ url: `${base}/projects/${p.slug}`, lastModified: p.updated_at });
  } catch { /* sitemap still lists static pages */ }
  return entries;
}
