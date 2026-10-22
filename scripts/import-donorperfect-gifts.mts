/**
 * Imports gifts from a DonorPerfect Report Builder CSV ("Gift/Pledge Transactions" with DONOR_ID, GIFT_ID, GIFT_DATE,
 * AMOUNT, RECORD_TYPE, GL_CODE, GL_CODE_DESCR, GIFT_TYPE_DESCR, CAMPAIGN_DESCR, SOLICIT_CODE_DESCR, GIFT_NARRATIVE).
 *   Preview (no changes):  npx tsx --env-file=.env.local scripts/import-donorperfect-gifts.mts path/to/gifts.csv
 *   Import:                npx tsx --env-file=.env.local scripts/import-donorperfect-gifts.mts path/to/gifts.csv --apply
 *
 * Run the donor import (import-donorperfect.mts) first: gifts are matched to donors by DonorPerfect ID. Each gift is
 * recorded as a settled offline gift on its DonorPerfect date, against the designation its General Ledger code maps
 * to. Nothing is emailed and no Mission Giving receipts are created (DonorPerfect already acknowledged these gifts).
 * Safe to re-run: gifts already imported (same DonorPerfect Gift ID, migration 0025) are skipped.
 * Keep the export OUT of public/ — files there are downloadable by anyone once the site is deployed.
 */
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GL_TO_PROJECT, columnOf, dpCents, dpDate, parseCsv } from "../src/lib/admin/dp-csv";

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file || file.startsWith("--")) throw new Error("Usage: import-donorperfect-gifts.mts <gifts.csv> [--apply]");
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");

const [header, ...body] = parseCsv(readFileSync(file, "utf8"));
const col = (name: string) => columnOf(header, name);
const C = {
  donor: col("DONOR_ID"), gift: col("GIFT_ID"), date: col("GIFT_DATE"), amount: col("AMOUNT"), type: col("RECORD_TYPE"), gl: col("GL_CODE"),
  glName: col("GL_CODE_DESCR"), method: col("GIFT_TYPE_DESCR"), campaign: col("CAMPAIGN_DESCR"), solicit: col("SOLICIT_CODE_DESCR"), note: col("GIFT_NARRATIVE"),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient(url, key, { auth: { persistSession: false } }) as SupabaseClient<any, "public", any>;
const probe = await db.from("donations").select("dp_gift_id").limit(1);
if (probe.error) throw new Error(`Apply migration 0025_donorperfect_gifts.sql first (${probe.error.message}).`);

async function all<T>(build: (from: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}
const donors = await all<{ id: string; dp_id: string }>((f) => db.from("donor_profiles").select("id, dp_id").not("dp_id", "is", null).is("deleted_at", null).range(f, f + 999));
const byDp = new Map(donors.map((d) => [d.dp_id, d.id]));
const imported = new Set((await all<{ dp_gift_id: string }>((f) => db.from("donations").select("dp_gift_id").not("dp_gift_id", "is", null).range(f, f + 999))).map((d) => d.dp_gift_id));
const projects = await all<{ id: string; title: string; fund_id: string | null }>((f) => db.from("projects").select("id, title, fund_id").range(f, f + 999));
const projectByTitle = new Map(projects.map((p) => [p.title.toLowerCase(), p]));
const generalFund = (await db.from("funds").select("id").eq("key", "general").maybeSingle()).data?.id ?? null;


type Gift = { dpGift: string; donorId: string; date: string; cents: number; gl: string; note: string };
const gifts: Gift[] = [];
const skipped: Record<string, string[]> = {};
const skip = (reason: string, id: string) => (skipped[reason] ??= []).push(id);
const unknownGl = new Map<string, string>();
for (const r of body) {
  const dpGift = r[C.gift]?.trim(), dpDonor = r[C.donor]?.trim();
  if (!dpGift) { skip("no Gift ID", "?"); continue; }
  if (r[C.type]?.trim().toUpperCase() !== "G") { skip("not a gift (pledge or other record type)", dpGift); continue; }
  if (imported.has(dpGift)) { skip("already imported", dpGift); continue; }
  const donorId = byDp.get(dpDonor);
  if (!donorId) { skip("donor not found in Mission Giving (import donors first)", `${dpGift} (donor ${dpDonor})`); continue; }
  const date = dpDate(r[C.date]), amount = dpCents(r[C.amount]);
  if (!date) { skip("no or unreadable date", dpGift); continue; }
  if (!(amount > 0)) { skip("zero or negative amount", `${dpGift} (${r[C.amount]})`); continue; }
  const gl = (r[C.gl] ?? "").trim().toUpperCase();
  if (!(gl in GL_TO_PROJECT)) unknownGl.set(gl, r[C.glName] ?? "");
  const extra = [r[C.method] && `Paid by ${r[C.method].trim()}`, r[C.campaign] && `Campaign: ${r[C.campaign].trim()}`, r[C.solicit] && `Solicitation: ${r[C.solicit].trim()}`].filter(Boolean);
  const narrative = (r[C.note] ?? "").trim();
  gifts.push({ dpGift, donorId, date, cents: amount, gl, note: [`DonorPerfect gift #${dpGift}`, ...extra].join(" · ") + (narrative ? ` — ${narrative}` : "") });
}
if (unknownGl.size) throw new Error(`Unmapped General Ledger codes (add them to GL_TO_PROJECT): ${[...unknownGl].map(([c, n]) => `${c} "${n}"`).join(", ")}`);

const missing = [...new Set(Object.values(GL_TO_PROJECT).filter((t): t is string => !!t && !projectByTitle.has(t.toLowerCase())))];
const byDesignation = new Map<string, { n: number; cents: number }>();
for (const g of gifts) { const k = GL_TO_PROJECT[g.gl] ?? "General Fund"; const e = byDesignation.get(k) ?? { n: 0, cents: 0 }; e.n++; e.cents += g.cents; byDesignation.set(k, e); }
const dollars = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

console.log(`${apply ? "IMPORTING into" : "PREVIEW for"} ${new URL(url).host}`);
console.log(`${body.length} rows read → ${gifts.length} gifts to import, totaling ${dollars(gifts.reduce((s, g) => s + g.cents, 0))}, for ${new Set(gifts.map((g) => g.donorId)).size} donors.`);
for (const [reason, ids] of Object.entries(skipped)) console.log(`  skipped ${ids.length}: ${reason}${ids.length <= 10 ? ` (${ids.join(", ")})` : ""}`);
console.log("By designation:");
for (const [k, v] of [...byDesignation].sort((a, b) => b[1].cents - a[1].cents)) console.log(`  ${k}: ${v.n} gifts, ${dollars(v.cents)}${missing.includes(k) ? "  (new designation, not public)" : ""}`);
if (!apply) { console.log("\nPreview only. Re-run with --apply to import."); process.exit(0); }

// Designations that don't exist yet are created like "+ New designation": a draft, non-public project with its own fund.
for (const title of missing) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { data: fund, error: fe } = await db.from("funds").insert({ key: `project-${slug}`, name: title, restriction: "restricted" }).select("id").single();
  if (fe || !fund) throw new Error(`Could not create the fund for ${title}: ${fe?.message}`);
  const { data: p, error: pe } = await db.from("projects").insert({ title, slug, fund_id: fund.id, status: "draft", is_public: false }).select("id, title, fund_id").single();
  if (pe || !p) throw new Error(`Could not create ${title}: ${pe?.message}`);
  projectByTitle.set(title.toLowerCase(), p);
  console.log(`  created designation "${title}"`);
}

const rows = gifts.map((g) => {
  const title = GL_TO_PROJECT[g.gl];
  const p = title ? projectByTitle.get(title.toLowerCase())! : null;
  const when = `${g.date}T12:00:00Z`;
  return {
    donor_id: g.donorId, project_id: p?.id ?? null, fund_id: p?.fund_id ?? generalFund, amount_cents: g.cents, currency: "USD", frequency: "one_time",
    payment_method: "offline", status: "succeeded", is_offline: true, donor_note: g.note.slice(0, 1000), settled_at: when, donated_at: when, dp_gift_id: g.dpGift,
  };
});
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await db.from("donations").insert(rows.slice(i, i + 500));
  if (error) throw new Error(`Insert failed at batch ${i / 500 + 1}: ${error.message}. Earlier batches were saved; re-running skips them.`);
  process.stdout.write(`  imported ${Math.min(i + 500, rows.length)}/${rows.length}\r`);
}
await db.from("audit_logs").insert({ actor_id: null, action: "financial.adjustment", entity_type: "import", details: { source: "donorperfect_gifts", inserted: rows.length, cents: gifts.reduce((s, g) => s + g.cents, 0) } });
console.log(`\nDone: ${rows.length} gifts imported.`);
