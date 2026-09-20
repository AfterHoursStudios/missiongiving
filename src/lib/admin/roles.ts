import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/** User ids that currently hold the super_admin role AND are active staff. */
export async function activeSuperAdminIds(): Promise<string[]> {
  const db = createSupabaseAdminClient();
  const { data: role } = await db.from("roles").select("id").eq("key", "super_admin").single();
  const { data } = await db.from("staff_role_assignments").select("user_id, staff_profiles!inner(active)").eq("role_id", role?.id ?? "");
  return (data ?? []).filter((r) => { const s = Array.isArray(r.staff_profiles) ? r.staff_profiles[0] : r.staff_profiles; return s?.active; }).map((r) => r.user_id as string);
}
export const isSuperAdmin = async (userId: string) => (await activeSuperAdminIds()).includes(userId);
