import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { goalStatus } from "./project-schema";

/**
 * Deliberately NOT in a "use server" file: everything exported from one of those is a publicly callable endpoint.
 * Callers (admin pages) must already have passed requirePermission("projects.manage").
 */
/** Marks active projects whose confirmed total has reached the goal. Never reverts a status. */
export async function syncGoalStatuses() {
  const db = createSupabaseAdminClient();
  const { data: active } = await db.from("projects").select("id, goal_cents, offline_adjustment_cents, status").eq("status", "active").not("goal_cents", "is", null);
  for (const p of active ?? []) {
    const { data } = await db.rpc("project_totals", { p_project_id: p.id });
    const raised = Number(data?.[0]?.raised_cents ?? 0) + p.offline_adjustment_cents;
    const next = goalStatus(p.status, raised, p.goal_cents);
    if (next !== p.status) await db.from("projects").update({ status: next }).eq("id", p.id).eq("status", "active");
  }
}
