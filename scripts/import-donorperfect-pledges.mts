/**
 * Imports pledges (recurring gifts) from DonorPerfect and links their payments to them.
 *   Preview (no changes):  npx tsx --env-file=.env.local scripts/import-donorperfect-pledges.mts pledges.csv gifts.csv
 *   Import:                npx tsx --env-file=.env.local scripts/import-donorperfect-pledges.mts pledges.csv gifts.csv --apply
 *
 * pledges.csv: Report Builder "Gift/Pledge Transactions" with "Include Pledges" ticked and DONOR_ID, GIFT_ID, RECORD_TYPE,
 *   GIFT_DATE, START_DATE, BILL, FREQUENCY, GL_CODE, WRITEOFF_DATE (and optionally EFT, TOTAL_PAID, LAST_PAID_DATE).
 * gifts.csv: the gifts export with GIFT_ID and PLINK (the pledge each payment belongs to).
 *
 * Run the donor and gift imports first. Each pledge becomes a recurring gift on its donor's Pledges tab: open pledges
 * as active, written-off ones as canceled. DonorPerfect keeps processing them; Mission Giving never charges, changes or
 * cancels them (they have no Stripe subscription, migration 0026). Payments already imported are linked to their
 * pledge so the Pledges tab shows what each has paid. Nothing is emailed. Safe to re-run.
 */
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GL_TO_PROJECT, columnOf, dpCents, dpDate, dpFrequency, parseCsv } from "../src/lib/admin/dp-csv";
import { monthlyEquivalentCents } from "../src/lib/donations/frequency";

const [pledgeFile, giftFile] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!pledgeFile || !giftFile) throw new Error("Usage: import-donorperfect-pledges.mts <pledges.csv> <gifts.csv> [--apply]");
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(url, key, { auth: { persistSession: false } }) as SupabaseClient<any, "public", any>;
const probe = await db.from("recurring_donations").select("dp_pledge_id").limit(1);
if (probe.error) throw new Error(`Apply migration 0026_donorperfect_pledges.sql first (${probe.error.message}).`);

async function all<T>(build: (from: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}
const donorByDp = new Map((await all<{ id: string; dp_id: string }>((f) => db.from("donor_profiles").select("id, dp_id").not("dp_id", "is", null).is("deleted_at", null).range(f, f + 999))).map((d) => [d.dp_id, d.id]));
const existing = new Map((await all<{ id: string; dp_pledge_id: string }>((f) => db.from("recurring_donations").select("id, dp_pledge_id").not("dp_pledge_id", "is", null).range(f, f + 999))).map((r) => [r.dp_pledge_id, r.id]));
const projectByTitle = new Map((await all<{ id: string; title: string; fund_id: string | null }>((f) => db.from("projects").select("id, title, fund_id").range(f, f + 999))).map((p) => [p.title.toLowerCase(), p]));
const generalFund = (await db.from("funds").select("id").eq("key", "general").maybeSingle()).data?.id ?? null;

// ---- Pledges
const [ph, ...pbody] = parseCsv(readFileSync(pledgeFile, "utf8"));
const P = {
  donor: columnOf(ph, "DONOR_ID"), id: columnOf(ph, "GIFT_ID"), type: columnOf(ph, "RECORD_TYPE"), date: columnOf(ph, "GIFT_DATE"),
  start: columnOf(ph, "START_DATE"), bill: columnOf(ph, "BILL"), freq: columnOf(ph, "FREQUENCY"), gl: columnOf(ph, "GL_CODE"), writeoff: columnOf(ph, "WRITEOFF_DATE"),
};
type Pledge = { dpId: string; donorId: string; cents: number; frequency: ReturnType<typeof dpFrequency>; gl: string; started: string; endedOn: string | null; freqCode: string };
const pledges: Pledge[] = [];
const skipped: Record<string, string[]> = {};
const skip = (reason: string, id: string) => (skipped[reason] ??= []).push(id);
const unknownGl = new Set<string>();
for (const r of pbody) {
  if (r[P.type]?.trim().toUpperCase() !== "P") continue; // gift rows in the same export
  const dpId = r[P.id]?.trim();
  if (!dpId) { skip("no pledge ID", "?"); continue; }
  const donorId = donorByDp.get(r[P.donor]?.trim());
  if (!donorId) { skip("donor not found in Mission Giving", `${dpId} (donor ${r[P.donor]})`); continue; }
  const cents = dpCents(r[P.bill]);
  if (!(cents > 0)) { skip("no billing amount", dpId); continue; }
  const gl = (r[P.gl] ?? "").trim().toUpperCase();
  if (!(gl in GL_TO_PROJECT)) unknownGl.add(gl);
  pledges.push({
    dpId, donorId, cents, frequency: dpFrequency(r[P.freq]), freqCode: (r[P.freq] ?? "").trim().toUpperCase(), gl,
    started: dpDate(r[P.start]) ?? dpDate(r[P.date]) ?? new Date().toISOString().slice(0, 10), endedOn: dpDate(r[P.writeoff]),
  });
}
if (unknownGl.size) throw new Error(`Unmapped General Ledger codes (add them to GL_TO_PROJECT in src/lib/admin/dp-csv.ts): ${[...unknownGl].join(", ")}`);
const missingProjects = [...new Set(pledges.map((p) => GL_TO_PROJECT[p.gl]).filter((t): t is string => !!t && !projectByTitle.has(t.toLowerCase())))];
if (missingProjects.length) throw new Error(`Designations not found (run the gift import first): ${missingProjects.join(", ")}`);
const toAdd = pledges.filter((p) => !existing.has(p.dpId));

// ---- Payment links (gift → pledge)
const [gh, ...gbody] = parseCsv(readFileSync(giftFile, "utf8"));
const G = { id: columnOf(gh, "GIFT_ID"), plink: columnOf(gh, "PLINK") };
const links = gbody.map((r) => ({ gift: r[G.id]?.trim(), pledge: r[G.plink]?.trim() })).filter((l) => l.gift && l.pledge && l.pledge !== "0");
const pledgeIds = new Set(pledges.map((p) => p.dpId));
const linkable = links.filter((l) => pledgeIds.has(l.pledge));

const dollars = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const open = pledges.filter((p) => !p.endedOn);
console.log(`${apply ? "IMPORTING into" : "PREVIEW for"} ${new URL(url).host}`);
console.log(`${pledges.length} pledges for ${new Set(pledges.map((p) => p.donorId)).size} donors: ${open.length} active (${dollars(open.reduce((s, p) => s + monthlyEquivalentCents(p.cents, p.frequency), 0))} a month, excluding yearly), ${pledges.length - open.length} canceled (written off).`);
console.log(`  ${toAdd.length} to add, ${pledges.length - toAdd.length} already imported.`);
const odd = pledges.filter((p) => !["monthly", "yearly"].includes(p.frequency));
if (odd.length) console.log(`  ${odd.length} on another schedule: ${odd.map((p) => `${p.dpId} ${p.frequency}`).join(", ")}.`);
for (const [reason, ids] of Object.entries(skipped)) console.log(`  skipped ${ids.length}: ${reason}${ids.length <= 10 ? ` (${ids.join(", ")})` : ""}`);
console.log(`${linkable.length} imported gifts will be linked to their pledge (${links.length - linkable.length} reference a pledge not in the file).`);
if (!apply) { console.log("\nPreview only. Re-run with --apply to import."); process.exit(0); }

// Insert pledges
const rows = toAdd.map((p) => {
  const title = GL_TO_PROJECT[p.gl];
  const project = title ? projectByTitle.get(title.toLowerCase())! : null;
  return {
    donor_id: p.donorId, project_id: project?.id ?? null, fund_id: project?.fund_id ?? generalFund, amount_cents: p.cents, currency: "USD",
    frequency: p.frequency, status: p.endedOn ? "canceled" : "active", dp_pledge_id: p.dpId,
    created_at: `${p.started}T12:00:00Z`, canceled_at: p.endedOn ? `${p.endedOn}T12:00:00Z` : null, cancel_reason: p.endedOn ? "Written off in DonorPerfect" : null,
  };
});
for (let i = 0; i < rows.length; i += 200) {
  const { data, error } = await db.from("recurring_donations").insert(rows.slice(i, i + 200)).select("id, dp_pledge_id");
  if (error) throw new Error(`Pledge insert failed at batch ${i / 200 + 1}: ${error.message}. Earlier batches were saved; re-running skips them.`);
  for (const r of data ?? []) existing.set(r.dp_pledge_id, r.id);
}

// Link payments: each gift gets its pledge (recurring_id) and the pledge's frequency.
const byPledge = new Map<string, string[]>();
for (const l of linkable) byPledge.set(l.pledge, [...(byPledge.get(l.pledge) ?? []), l.gift]);
const freqOf = new Map(pledges.map((p) => [p.dpId, p.frequency]));
let linked = 0;
for (const [pledge, gifts] of byPledge) {
  const recurringId = existing.get(pledge);
  if (!recurringId) continue;
  for (let i = 0; i < gifts.length; i += 200) {
    const { data, error } = await db.from("donations").update({ recurring_id: recurringId, frequency: freqOf.get(pledge) }).in("dp_gift_id", gifts.slice(i, i + 200)).select("id");
    if (error) throw new Error(`Linking gifts to pledge ${pledge} failed: ${error.message}`);
    linked += (data ?? []).length;
  }
}
await db.from("audit_logs").insert({ actor_id: null, action: "financial.adjustment", entity_type: "import", details: { source: "donorperfect_pledges", pledges_added: rows.length, gifts_linked: linked } });
console.log(`Done: ${rows.length} pledges added, ${linked} gifts linked to their pledge.`);
