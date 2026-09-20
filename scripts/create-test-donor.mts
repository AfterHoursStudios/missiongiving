/**
 * Creates (or resets the password of) a verified TEST donor account with a donor profile, for development.
 *   TEST_EMAIL=... TEST_PASSWORD=... npx tsx --env-file=.env.local scripts/create-test-donor.mts
 * Nothing is stored in the repository. Refuses a LIVE Stripe key. Use an @example.test address so no real person is involved.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, STRIPE_SECRET_KEY: stripeKey, TEST_EMAIL, TEST_PASSWORD } = process.env;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
if (!TEST_EMAIL || !TEST_PASSWORD) throw new Error("Set TEST_EMAIL and TEST_PASSWORD in the environment for this run.");
if (stripeKey?.startsWith("sk_live_")) throw new Error("Refusing: a LIVE Stripe key is configured.");
if (TEST_PASSWORD.length < 12) throw new Error("Password must be at least 12 characters.");

// Rows are untyped until `supabase gen types` output is added.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(url, key, { auth: { persistSession: false } }) as SupabaseClient<any, "public", any>;
const email = TEST_EMAIL.trim().toLowerCase();

let userId: string;
const created = await db.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true, user_metadata: { first_name: "Test", last_name: "Donor" } });
if (created.data.user) {
  userId = created.data.user.id;
} else {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!existing) throw new Error(`Could not create user: ${created.error?.message}`);
  const upd = await db.auth.admin.updateUserById(existing.id, { password: TEST_PASSWORD, email_confirm: true });
  if (upd.error) throw new Error(`Could not update user: ${upd.error.message}`);
  userId = existing.id;
}

const { data: existingDonor } = await db.from("donor_profiles").select("id").eq("user_id", userId).maybeSingle();
if (!existingDonor) {
  const { error } = await db.from("donor_profiles").insert({ user_id: userId, email, normalized_email: email, first_name: "Test", last_name: "Donor" });
  if (error) throw new Error(`Could not create donor profile: ${error.message}`);
}
console.log(`Test donor ready: ${email}`);
