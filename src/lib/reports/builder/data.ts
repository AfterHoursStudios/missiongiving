import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { getOrgSettings } from "@/lib/settings";
import { zoned } from "@/lib/admin/metrics";
import { isPlaceholderEmail } from "@/lib/admin/dp-import";
import { SETTLED_STATUSES } from "@/lib/donations/status";
import { twelveMonthsBefore, type Row } from "./engine";
import { SOURCES, type FieldDef, type SourceKey } from "./fields";

const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Rows for a report-builder report. Callers MUST have passed requirePermission("reports.view"). Without donors.view,
 * personal details (FieldDef.pii) are blanked here as well as being removed from the definition.
 */
export async function loadBuilderRows(source: SourceKey, canViewDonors: boolean): Promise<{ rows: Row[]; today: string }> {
  const db = createSupabaseAdminClient();
  const { timezone } = await getOrgSettings();
  const ymd = (iso: string | null) => { if (!iso) return null; const p = zoned(iso, timezone); return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`; };
  const today = ymd(new Date().toISOString())!;

  const [donorsRes, tagsRes] = await Promise.all([
    fetchAll(() => db.from("donor_profiles").select("id, first_name, last_name, organization_name, email, phone, address_line1, address_line2, city, region, postal_code, country, status, created_at")
      .is("deleted_at", null).is("merged_into", null)),
    fetchAll(() => db.from("donor_tag_assignments").select("donor_id, tag_id, donor_tags(name)"), { orderBy: ["donor_id", "tag_id"] }),
  ]);
  if (donorsRes.error) throw new Error(donorsRes.error.message);
  const tags = new Map<string, string[]>();
  for (const t of tagsRes.data ?? []) {
    const name = one<{ name: string }>(t.donor_tags)?.name;
    if (name) tags.set(t.donor_id as string, [...(tags.get(t.donor_id as string) ?? []), name]);
  }
  const donorRow = new Map<string, Row>();
  for (const d of donorsRes.data ?? []) {
    donorRow.set(d.id, {
      donor_name: [d.first_name, d.last_name].filter(Boolean).join(" "), first_name: d.first_name, last_name: d.last_name,
      organization: d.organization_name, email: isPlaceholderEmail(d.email) ? null : d.email, phone: d.phone,
      address: [d.address_line1, d.address_line2].filter(Boolean).join(", ") || null, city: d.city, state: d.region, postal_code: d.postal_code,
      country: d.country, donor_status: d.status, tags: (tags.get(d.id) ?? []).sort().join(", ") || null, donor_since: ymd(d.created_at),
    });
  }

  const giftsRes = await fetchAll(() => db.from("donations")
    .select("id, donor_id, amount_cents, refunded_cents, fee_cents, status, frequency, payment_method, is_offline, recurring_id, donor_note, settled_at, donated_at, funds(name, restriction), projects(title), receipts(receipt_number)")
    .is("archived_at", null));
  if (giftsRes.error) throw new Error(giftsRes.error.message);

  let rows: Row[];
  if (source === "gifts") {
    rows = [];
    for (const g of giftsRes.data ?? []) {
      const donor = donorRow.get(g.donor_id);
      if (!donor) continue; // deleted or merged donor
      const date = ymd(g.settled_at ?? g.donated_at);
      const fund = one<{ name: string; restriction: string }>(g.funds);
      rows.push({
        ...donor, gift_date: date, gift_year: date?.slice(0, 4) ?? null, gift_month: date?.slice(0, 7) ?? null,
        amount: g.amount_cents, refunded: g.refunded_cents, net: g.amount_cents - g.refunded_cents, fee: g.fee_cents ?? null,
        status: g.status, frequency: g.frequency, payment_method: g.payment_method, offline: g.is_offline, recurring: !!g.recurring_id,
        designation: one<{ title: string }>(g.projects)?.title ?? "General Fund", fund: fund?.name ?? "General Fund",
        restriction: fund?.restriction ?? "unrestricted", receipt_number: one<{ receipt_number: string }>(g.receipts)?.receipt_number ?? null,
        gift_note: g.donor_note,
      });
    }
  } else {
    const { data: rec } = await fetchAll(() => db.from("recurring_donations").select("id, donor_id, amount_cents, frequency").eq("status", "active"));
    const recurring = new Map<string, number>();
    for (const r of rec ?? []) recurring.set(r.donor_id, (recurring.get(r.donor_id) ?? 0) + r.amount_cents);
    const settled = SETTLED_STATUSES as readonly string[];
    const since = twelveMonthsBefore(today);
    const giving = new Map<string, { total: number; year: number; count: number; first: [string, number] | null; last: [string, number] | null; max: number }>();
    for (const g of giftsRes.data ?? []) {
      if (!settled.includes(g.status)) continue;
      const date = ymd(g.settled_at ?? g.donated_at)!, net = g.amount_cents - g.refunded_cents;
      const e = giving.get(g.donor_id) ?? { total: 0, year: 0, count: 0, first: null, last: null, max: 0 };
      e.total += net; e.count++; e.max = Math.max(e.max, g.amount_cents);
      if (date > since && date <= today) e.year += net;
      if (!e.first || date < e.first[0]) e.first = [date, g.amount_cents];
      if (!e.last || date > e.last[0]) e.last = [date, g.amount_cents];
      giving.set(g.donor_id, e);
    }
    rows = [...donorRow].map(([id, donor]) => {
      const e = giving.get(id);
      return {
        ...donor, lifetime_giving: e?.total ?? 0, giving_12_months: e?.year ?? 0, gift_count: e?.count ?? 0,
        first_gift_date: e?.first?.[0] ?? null, first_gift_amount: e?.first?.[1] ?? null,
        last_gift_date: e?.last?.[0] ?? null, last_gift_amount: e?.last?.[1] ?? null, largest_gift: e ? e.max : null,
        recurring_active: recurring.has(id), recurring_amount: recurring.get(id) ?? null,
      };
    });
  }

  if (!canViewDonors) {
    const pii = (SOURCES[source].fields as FieldDef[]).filter((f) => f.pii).map((f) => f.key);
    for (const r of rows) for (const k of pii) r[k] = null;
  }
  return { rows, today };
}
