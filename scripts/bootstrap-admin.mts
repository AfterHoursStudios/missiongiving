/**
 * One-time initial Super Admin bootstrap. No password is ever hardcoded.
 * Usage: npx tsx --env-file=.env.local scripts/bootstrap-admin.mts
 * Sends a Supabase invitation email to INITIAL_ADMIN_EMAIL; the person sets their own password from the link,
 * and is then granted the super_admin role. Refuses to run if a Super Admin already exists.
 */
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, INITIAL_ADMIN_EMAIL: email, NEXT_PUBLIC_APP_URL: app } = process.env;
if (!url || !key || !email) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and INITIAL_ADMIN_EMAIL");

const db = createClient(url, key, { auth: { persistSession: false } });

const { data: role } = await db.from("roles").select("id").eq("key", "super_admin").single();
if (!role) throw new Error("Run migrations first: super_admin role missing");
const { count } = await db.from("staff_role_assignments").select("*", { count: "exact", head: true }).eq("role_id", role.id);
if (count) throw new Error("A Super Admin already exists. Use the admin portal to add staff.");

const { data, error } = await db.auth.admin.inviteUserByEmail(email, { redirectTo: `${app ?? "http://localhost:3000"}/auth/callback?next=/admin` });
if (error) throw error;
const id = data.user.id;

await db.from("staff_profiles").upsert({ user_id: id, display_name: email });
await db.from("staff_role_assignments").upsert({ user_id: id, role_id: role.id });
await db.from("audit_logs").insert({ actor_id: null, action: "permissions.change", entity_type: "staff", entity_id: id, details: { via: "bootstrap-admin", role: "super_admin" } });
console.log(`Invitation sent to ${email}. Open the email link to set a password.`);
