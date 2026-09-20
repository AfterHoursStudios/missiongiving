import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

/** Records a staff sign-in (password, magic link or invitation). A logging failure must never block a legitimate login. */
/** Returns true when the user is active staff (so callers can send them to the admin area). */
export async function auditStaffLogin(userId: string): Promise<boolean> {
  try {
    const { data } = await createSupabaseAdminClient().from("staff_profiles").select("active").eq("user_id", userId).maybeSingle();
    if (!data?.active) return false;
    await audit(userId, "staff.login", "staff", userId);
    return true;
  } catch {
    console.error("[auth] staff login audit failed");
    return false;
  }
}
