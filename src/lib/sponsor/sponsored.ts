import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { holdsSponsorship } from "./holds";

export interface Sponsor { recurringId: string; name: string; amountCents: number }

async function heldGifts() {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("recurring_donations")
    .select("id, project_id, donor_id, amount_cents, status, created_at").not("project_id", "is", null).in("status", ["active", "past_due", "incomplete"]);
  return { admin, rows: (data ?? []).filter((r) => holdsSponsorship(r.status, r.created_at)) };
}

/**
 * Monthly cents already pledged per backing project (full and partial sponsors together). Read with the service role because visitors
 * cannot see recurring gifts; only the total is used, never who the sponsors are.
 */
export async function heldCentsByProject(): Promise<Map<string, number>> {
  const { rows } = await heldGifts();
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.project_id as string, (m.get(r.project_id as string) ?? 0) + Number(r.amount_cents));
  return m;
}

/** Backing project id -> her monthly sponsors with what each gives, for admin screens only (never expose on public pages). */
export async function sponsorsByProject(): Promise<Map<string, Sponsor[]>> {
  const { admin, rows } = await heldGifts();
  const donorIds = [...new Set(rows.map((r) => r.donor_id as string))];
  const { data: donors } = donorIds.length ? await admin.from("donor_summary").select("id, first_name, last_name").in("id", donorIds) : { data: [] };
  const names = new Map((donors ?? []).map((d) => [d.id as string, [d.first_name, d.last_name].filter(Boolean).join(" ")]));
  const m = new Map<string, Sponsor[]>();
  for (const r of rows) {
    const list = m.get(r.project_id as string) ?? [];
    list.push({ recurringId: r.id as string, name: names.get(r.donor_id as string) || "a donor", amountCents: Number(r.amount_cents) });
    m.set(r.project_id as string, list);
  }
  return m;
}
