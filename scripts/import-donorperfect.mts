/**
 * Imports donors from a DonorPerfect constituent export (.xlsx).
 *   Preview (no changes):  npx tsx --env-file=.env.local scripts/import-donorperfect.mts path/to/Donors.xlsx
 *   Import:                npx tsx --env-file=.env.local scripts/import-donorperfect.mts path/to/Donors.xlsx --apply
 *
 * Safe to re-run: donors are matched by DonorPerfect ID (then by email), and matched records are updated rather than
 * duplicated. Contact fields only fill blanks on an existing record; they never overwrite what staff or the donor set.
 * Donors with no email get an internal placeholder address that is never emailed; staff can replace it on the record.
 * Giving totals are stored as DonorPerfect history (migration 0016); no donation rows are created.
 * Keep the export OUT of public/ — files there are downloadable by anyone once the site is deployed.
 */
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mapRows, placeholderEmail, readXlsx, type ImportDonor } from "../src/lib/admin/dp-import";

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file || file.startsWith("--")) throw new Error("Usage: import-donorperfect.mts <file.xlsx> [--apply]");
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

const { donors, skipped, columns } = mapRows(readXlsx(readFileSync(file)));
console.log(`${apply ? "IMPORTING into" : "PREVIEW for"} ${new URL(url).host}`);
console.log(`Columns used: ${Object.entries(columns).map(([f, h]) => `${h} → ${f}`).join(", ")}`);
console.log(`${donors.length} donors read, ${skipped.length} rows skipped${skipped.length ? `: ${skipped.slice(0, 10).map((s) => `row ${s.row} (${s.reason})`).join(", ")}` : ""}`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(url, key, { auth: { persistSession: false } }) as SupabaseClient<any, "public", any>;
const probe = await db.from("donor_profiles").select("dp_id").limit(1);
if (probe.error) throw new Error(`Apply migration 0016_donorperfect_import.sql first (${probe.error.message}).`);

// Existing records to match against.
type Existing = { id: string; dp_id: string | null; normalized_email: string; phone: string | null; address_line1: string | null; organization_name: string | null };
const existing: Existing[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("donor_profiles").select("id, dp_id, normalized_email, phone, address_line1, organization_name").is("deleted_at", null).range(from, from + 999);
  if (error) throw new Error(error.message);
  existing.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}
const byDp = new Map(existing.filter((e) => e.dp_id).map((e) => [e.dp_id!, e]));
const byEmail = new Map(existing.map((e) => [e.normalized_email.toLowerCase(), e]));

const history = (d: ImportDonor, now: string) => ({
  dp_id: d.dpId, dp_score: d.score, dp_total_given_cents: d.totalGivenCents, dp_gift_count: d.giftCount,
  dp_last_gift_at: d.lastGiftAt, dp_last_gift_cents: d.lastGiftCents, dp_imported_at: now,
});
const now = new Date().toISOString();
const inserts: Record<string, unknown>[] = [];
const updates: { id: string; values: Record<string, unknown> }[] = [];
for (const d of donors) {
  const match = byDp.get(d.dpId) ?? (d.email ? byEmail.get(d.email) : undefined);
  if (match) {
    // Fill blanks only; never overwrite contact details already on the record.
    const values: Record<string, unknown> = { ...history(d, now) };
    if (!match.phone && d.phone) values.phone = d.phone;
    if (!match.address_line1 && d.address1) Object.assign(values, { address_line1: d.address1, address_line2: d.address2, city: d.city, region: d.region, postal_code: d.postalCode, ...(d.country ? { country: d.country } : {}) });
    if (!match.organization_name && d.organizationName) values.organization_name = d.organizationName;
    updates.push({ id: match.id, values });
  } else {
    const email = d.email ?? placeholderEmail(d.dpId);
    inserts.push({
      email, normalized_email: email, first_name: d.firstName, last_name: d.lastName, organization_name: d.organizationName,
      phone: d.phone, address_line1: d.address1, address_line2: d.address2, city: d.city, region: d.region, postal_code: d.postalCode,
      ...(d.country ? { country: d.country } : {}), ...history(d, now),
    });
  }
}
const noEmail = donors.filter((d) => !d.email).length;
console.log(`→ ${inserts.length} new donors, ${updates.length} existing donors updated, ${noEmail} without an email (placeholder address).`);
console.log(`→ DonorPerfect giving history: $${(donors.reduce((s, d) => s + d.totalGivenCents, 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} across ${donors.reduce((s, d) => s + d.giftCount, 0)} gifts (shown on donor records; not added to reports).`);
if (!apply) { console.log("\nPreview only. Re-run with --apply to import."); process.exit(0); }

for (let i = 0; i < inserts.length; i += 200) {
  const batch = inserts.slice(i, i + 200);
  const { data, error } = await db.from("donor_profiles").insert(batch).select("id");
  if (error) throw new Error(`Insert failed at row batch ${i / 200 + 1}: ${error.message}. Earlier batches were saved; re-running is safe.`);
  // New donors start opted in to news, project updates and statements (same as every other new donor; migration 0021).
  await db.from("communication_preferences").upsert((data ?? []).map((r) => ({ donor_id: r.id, marketing_email: true, project_updates: true, annual_statement_email: true })), { onConflict: "donor_id", ignoreDuplicates: true });
  process.stdout.write(`  inserted ${Math.min(i + 200, inserts.length)}/${inserts.length}\r`);
}
for (const [n, u] of updates.entries()) {
  const { error } = await db.from("donor_profiles").update(u.values).eq("id", u.id);
  if (error) throw new Error(`Update failed for donor ${u.id}: ${error.message}`);
  if (n % 50 === 0) process.stdout.write(`  updated ${n + 1}/${updates.length}\r`);
}
await db.from("audit_logs").insert({ actor_id: null, action: "donor.create", entity_type: "import", details: { source: "donorperfect", inserted: inserts.length, updated: updates.length } });
console.log(`\nDone: ${inserts.length} added, ${updates.length} updated.`);
