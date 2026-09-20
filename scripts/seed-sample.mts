/**
 * Loads FAKE sample data for local development or demos.
 *   ALLOW_SAMPLE_SEED=yes npx tsx --env-file=.env.local scripts/seed-sample.mts --yes
 * Safety: refuses to run without both the env flag and --yes, refuses live Stripe keys, and is idempotent (skips if sample
 * donors already exist). Donation and expense rows cannot be deleted through the app (by design); to clear sample data
 * from a scratch database use supabase/dev/remove-sample-data.sql as the database owner. NEVER seed a production database.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateSample } from "./sample-data";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, STRIPE_SECRET_KEY: stripeKey } = process.env;
if (process.env.ALLOW_SAMPLE_SEED !== "yes" || !process.argv.includes("--yes")) throw new Error("Refusing to run: set ALLOW_SAMPLE_SEED=yes and pass --yes.");
if (stripeKey?.startsWith("sk_live_")) throw new Error("Refusing to run: a LIVE Stripe key is configured. Sample data must never go near production.");
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

// Rows are untyped until `supabase gen types` output is added.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(url, key, { auth: { persistSession: false } }) as SupabaseClient<any, "public", any>;
console.log(`Seeding SAMPLE data into ${new URL(url).host} ...`);

const { count } = await db.from("donor_profiles").select("id", { count: "exact", head: true }).like("email", "sample-%@example.test");
if (count) { console.log("Sample donors already exist; nothing to do."); process.exit(0); }

const { donors, donations, expenses } = generateSample(new Date());
const must = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => { if (r.error || r.data === null) throw new Error(`${what}: ${r.error?.message}`); return r.data; };

const { data: general } = await db.from("funds").select("id").eq("key", "general").single();
const fund = must<{ id: string }>(await db.from("funds").upsert({ key: "project-sample-training", name: "[SAMPLE] Community Health Worker Training", restriction: "restricted" }, { onConflict: "key" }).select("id").single(), "fund");
const project = must<{ id: string }>(await db.from("projects").upsert({
  slug: "sample-community-health-worker-training", title: "[SAMPLE] Community Health Worker Training", summary: "Sample project for development. Not a real fundraising project.",
  story_html: "<p>This is SAMPLE DATA created by the seed script. Replace or archive it before launch.</p>", goal_cents: 1_000_000, status: "active", is_public: true, fund_id: fund.id,
}, { onConflict: "slug" }).select("id").single(), "project");

const insertedDonors = must<{ id: string; email: string }[]>(await db.from("donor_profiles").insert(donors.map((d) => ({
  email: d.email, normalized_email: d.email, first_name: d.first_name, last_name: d.last_name, region: d.region,
}))).select("id, email"), "donors");
const idOf = (i: number) => insertedDonors.find((x) => x.email === donors[i].email)!.id;
await db.from("communication_preferences").insert(donors.map((d, i) => ({ donor_id: idOf(i), marketing_email: d.marketing, project_updates: d.updates })));

for (const d of donations) {
  const row = must<{ id: string }>(await db.from("donations").insert({
    donor_id: idOf(d.donorIndex), fund_id: d.project ? fund.id : general?.id, project_id: d.project ? project.id : null, amount_cents: d.amount_cents, fee_cents: d.fee_cents,
    refunded_cents: d.refunded_cents, frequency: d.frequency, payment_method: d.payment_method, status: d.status, donated_at: d.donated_at, settled_at: d.settled_at, donor_note: "SAMPLE DATA",
  }).select("id").single(), "donation");
  await db.from("receipts").insert({ donation_id: row.id, is_final: d.settled_at !== null });
}

const { data: cats } = await db.from("expense_categories").select("id, name");
for (const e of expenses) {
  const cat = cats?.find((c) => c.name === e.categoryName) ?? cats?.[0];
  if (!cat) continue;
  must<{ id: string }>(await db.from("expenses").insert({
    expense_date: e.expense_date, vendor: e.vendor, description: e.description, amount_cents: e.amount_cents, category_id: cat.id,
    project_id: e.project ? project.id : null, restriction: e.project ? "restricted" : "unrestricted", approval: e.approval,
  }).select("id").single(), "expense");
}
console.log(`Done: ${donors.length} donors, ${donations.length} donations, ${expenses.length} expenses (all fake).`);
