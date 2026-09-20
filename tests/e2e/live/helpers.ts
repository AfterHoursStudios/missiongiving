import { createClient } from "@supabase/supabase-js";
import { test, type Page } from "@playwright/test";

/**
 * LIVE end-to-end tests. UNVERIFIED SCAFFOLDING: they were written without access to a Supabase/Stripe test project, so expect to
 * adjust selectors on the first real run. They need E2E_LIVE=1, a scratch Supabase project with migrations applied, Stripe TEST
 * keys, and `stripe listen --forward-to localhost:3100/api/webhooks/stripe` (see docs/TESTING.md). Donations cannot be deleted
 * through the app, so run them against a scratch database only.
 */
export const live = !!process.env.E2E_LIVE;
export const skipUnlessLive = () => test.skip(!live, "Needs E2E_LIVE=1 plus Supabase and Stripe test-mode credentials (docs/TESTING.md).");

export const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
export const uniqueEmail = (label: string) => `e2e-${label}-${Date.now()}@example.test`;
export const PASSWORD = "E2e-Test-Password-1";

/** Creates an already-verified donor account (skips the email round-trip). */
export async function createDonorUser(email: string) {
  const { data, error } = await admin().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { first_name: "E2E", last_name: "Donor" } });
  if (error) throw error;
  return data.user;
}

/** Creates a verified staff user holding the given role key (default super_admin). */
export async function createStaffUser(email: string, roleKey = "super_admin") {
  const db = admin();
  const user = await createDonorUser(email);
  const { data: role } = await db.from("roles").select("id").eq("key", roleKey).single();
  await db.from("staff_profiles").upsert({ user_id: user.id, display_name: "E2E Staff" });
  await db.from("staff_role_assignments").upsert({ user_id: user.id, role_id: role!.id });
  return user;
}

export async function signIn(page: Page, email: string, next = "/") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").first().fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"));
}
