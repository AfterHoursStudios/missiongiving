import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { donorFacingDesignation } from "./designation-label";

/**
 * Donor-facing designation labels by project id. Read with the server's own access because sponsorship projects aren't
 * public, so a donor's session can't see them (they'd wrongly show as "General Fund"). Callers must already have
 * checked the donor may see the gift; only the label is returned.
 */
export async function designationLabels(projectIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(projectIds.filter(Boolean))] as string[];
  if (ids.length === 0) return new Map();
  const { data } = await createSupabaseAdminClient().from("projects").select("id, title, kind").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id as string, donorFacingDesignation(p)]));
}

export async function designationLabel(projectId: string | null | undefined): Promise<string> {
  return projectId ? (await designationLabels([projectId])).get(projectId) ?? "General Fund" : "General Fund";
}
