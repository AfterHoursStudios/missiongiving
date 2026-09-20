import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

/** Records a staff sign-in (password, magic link or invitation). A logging failure must never block a legitimate login. */
export async function auditStaffLogin(userId: string) {
  try {
    const { data } = await createSupabaseAdminClient().from("staff_profiles").select("active").eq("user_id", userId).maybeSingle();
    if (data?.active) await audit(userId, "staff.login", "staff", userId);
  } catch {
    console.error("[auth] staff login audit failed");
  }
}
