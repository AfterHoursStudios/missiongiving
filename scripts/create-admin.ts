/**
 * Creates (or updates) a verified Super Admin with a password you supply at run time. FOR DEVELOPMENT / SCRATCH PROJECTS.
 *   PowerShell:  $env:ADMIN_EMAIL="you@example.org"; $env:ADMIN_PASSWORD="<your password>"; npm run admin:create
 * Nothing is stored in the repository: the password comes only from the environment. For production use `npm run admin:bootstrap`
 * (emailed invitation, you choose the password) and turn on MFA. Refuses a LIVE Stripe key as a guard against use on production.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, STRIPE_SECRET_KEY: stripeKey, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in the environment for this run.");
if (stripeKey?.startsWith("sk_live_")) throw new Error("Refusing: a LIVE Stripe key is configured. Use `npm run admin:bootstrap` for production.");
if (ADMIN_PASSWORD.length < 12) throw new Error("Password must be at least 12 characters.");

// Rows are untyped until `supabase gen types` output is added.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(url, key, { auth: { persistSession: false } }) as SupabaseClient<any, "public", any>;
const email = ADMIN_EMAIL.trim().toLowerCase();

let userId: string;
const created = await db.auth.admin.createUser({ email, password: ADMIN_PASSWORD, email_confirm: true });
if (created.data.user) {
  userId = created.data.user.id;
} else {
  // Already registered: find them and set the supplied password.
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!existing) throw new Error(`Could not create user: ${created.error?.message}`);
  const upd = await db.auth.admin.updateUserById(existing.id, { password: ADMIN_PASSWORD, email_confirm: true });
  if (upd.error) throw new Error(`Could not update user: ${upd.error.message}`);
  userId = existing.id;
}

const { data: role } = await db.from("roles").select("id").eq("key", "super_admin").single();
if (!role) throw new Error("super_admin role missing: apply migrations 0001-0008 first.");
await db.from("staff_profiles").upsert({ user_id: userId, display_name: email, active: true });
await db.from("staff_role_assignments").upsert({ user_id: userId, role_id: role.id });
await db.from("audit_logs").insert({ actor_id: null, action: "permissions.change", entity_type: "staff", entity_id: userId, details: { via: "create-admin script", role: "super_admin" } });
console.log(`Super Admin ready: ${email}. Sign in at /sign-in, then enable MFA and change the password if it is a shared or common one.`);
