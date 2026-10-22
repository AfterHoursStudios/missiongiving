/**
 * Permanently deletes donors by email, with everything tied to them (the same steps as Delete donor on a donor's page):
 * Stripe subscriptions canceled and the Stripe customer removed first, then delete_donor_completely (migration 0015),
 * then a donor-only sign-in account. Used to clear test donors before going live.
 *   Preview:  npx tsx --env-file=.env.local scripts/delete-donors.mts a@example.com,b@example.com
 *   Delete:   npx tsx --env-file=.env.local scripts/delete-donors.mts a@example.com,b@example.com --apply
 */
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const emails = (process.argv[2] ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
const apply = process.argv.includes("--apply");
if (!emails.length || process.argv[2].startsWith("--")) throw new Error("Usage: delete-donors.mts <email,email,...> [--apply]");
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, STRIPE_SECRET_KEY: stripeKey } = process.env;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(url, key, { auth: { persistSession: false } }) as SupabaseClient<any, "public", any>;
const stripe = stripeKey ? new Stripe(stripeKey) : null;
console.log(`${apply ? "DELETING from" : "PREVIEW for"} ${new URL(url).host}${stripeKey ? ` (Stripe ${stripeKey.startsWith("sk_live") ? "LIVE" : "test"} mode)` : ""}`);

const { data: donors, error } = await db.from("donor_profiles").select("id, first_name, last_name, normalized_email, user_id, stripe_customer_id").in("normalized_email", emails).is("deleted_at", null);
if (error) throw new Error(error.message);
const notFound = emails.filter((e) => !donors?.some((d) => d.normalized_email.toLowerCase() === e));
if (notFound.length) console.log(`Not found (nothing to delete): ${notFound.join(", ")}`);

for (const d of donors ?? []) {
  const [{ count: gifts }, { data: subs }] = await Promise.all([
    db.from("donations").select("id", { count: "exact", head: true }).eq("donor_id", d.id),
    db.from("recurring_donations").select("stripe_subscription_id").eq("donor_id", d.id).not("stripe_subscription_id", "is", null).not("status", "in", "(canceled,completed)"),
  ]);
  console.log(`- ${d.first_name} ${d.last_name} <${d.normalized_email}>: ${gifts ?? 0} gifts, ${subs?.length ?? 0} Stripe subscriptions to cancel${d.user_id ? ", has a sign-in" : ""}`);
  if (!apply) continue;

  if ((subs?.length || d.stripe_customer_id) && !stripe) throw new Error("STRIPE_SECRET_KEY is needed to cancel this donor's Stripe records. Nothing was deleted for them.");
  const gone = (e: unknown) => (e as { code?: string })?.code === "resource_missing";
  for (const s of subs ?? []) await stripe!.subscriptions.cancel(s.stripe_subscription_id!).catch((e) => { if (!gone(e)) throw e; });
  if (d.stripe_customer_id) await stripe!.customers.del(d.stripe_customer_id).catch((e) => { if (!gone(e)) throw e; });

  const { data: result, error: delErr } = await db.rpc("delete_donor_completely", { p_donor: d.id });
  if (delErr) throw new Error(`Could not delete ${d.normalized_email}: ${delErr.message}`);
  let loginRemoved = false;
  if (d.user_id) {
    const [{ data: staff }, { data: roles }] = await Promise.all([
      db.from("staff_profiles").select("user_id").eq("user_id", d.user_id).maybeSingle(),
      db.from("staff_role_assignments").select("user_id").eq("user_id", d.user_id).limit(1),
    ]);
    if (!staff && !(roles ?? []).length) loginRemoved = !(await db.auth.admin.deleteUser(d.user_id)).error;
  }
  await db.from("audit_logs").insert({ actor_id: null, action: "donor.delete", entity_type: "donor", entity_id: d.id, details: {
    source: "delete-donors script", donations_deleted: result?.donations_deleted ?? 0, recurring_deleted: result?.recurring_deleted ?? 0,
    stripe_subscriptions_canceled: subs?.length ?? 0, login_removed: loginRemoved,
  } });
  console.log(`    deleted (${result?.donations_deleted ?? 0} gifts, ${result?.recurring_deleted ?? 0} recurring${loginRemoved ? ", sign-in removed" : ""})`);
}
if (!apply) console.log("\nPreview only. Re-run with --apply to delete.");
