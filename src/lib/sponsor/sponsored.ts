import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { holdsSponsorship } from "./holds";

/**
 * Backing-project ids of sponsorships that currently have a monthly sponsor. Read with the service role because visitors cannot
 * see recurring gifts; only the yes/no result is used, never who the sponsor is.
 */
export async function sponsoredProjectIds(): Promise<Set<string>> {
  const { data } = await createSupabaseAdminClient().from("recurring_donations")
    .select("project_id, status, created_at").not("project_id", "is", null).in("status", ["active", "past_due", "incomplete"]);
  return new Set((data ?? []).filter((r) => holdsSponsorship(r.status, r.created_at)).map((r) => r.project_id as string));
}
