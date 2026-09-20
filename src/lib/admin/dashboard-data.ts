import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { DonationRec, ExpenseRec, ProjectRec, RecurringRec } from "./metrics";

/**
 * Loads non-personal figures for dashboards. Callers MUST have passed requirePermission("reports.view").
 * The service-role client is used deliberately so Read-Only Reporters can see aggregates without being granted
 * row access to donor PII; only the columns below are selected (no donor names, emails or notes).
 */
export async function loadDashboardData() {
  const db = createSupabaseAdminClient();
  const [donations, recurring, expenses, projects] = await Promise.all([
    db.from("donations").select("id, donor_id, amount_cents, refunded_cents, status, frequency, payment_method, settled_at, donated_at, projects(title), donation_tiers(public_title)").is("archived_at", null).limit(50000),
    db.from("recurring_donations").select("donor_id, amount_cents, frequency, status"),
    db.from("expenses").select("expense_date, amount_cents, approval").is("archived_at", null),
    db.from("projects").select("id, title, goal_cents, offline_adjustment_cents, end_date, status").neq("status", "archived"),
  ]);
  if (donations.error) throw new Error(donations.error.message);

  const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
  const donationRecs: DonationRec[] = (donations.data ?? []).map((d) => ({
    id: d.id, donor_id: d.donor_id, amount_cents: d.amount_cents, refunded_cents: d.refunded_cents, status: d.status,
    frequency: d.frequency, payment_method: d.payment_method, settled_at: d.settled_at, donated_at: d.donated_at,
    designation: one<{ title: string }>(d.projects)?.title ?? "General Fund",
    tier_title: one<{ public_title: string }>(d.donation_tiers)?.public_title ?? null,
  }));
  return {
    donations: donationRecs,
    recurring: (recurring.data ?? []) as RecurringRec[],
    expenses: (expenses.data ?? []) as ExpenseRec[],
    projects: (projects.data ?? []) as (ProjectRec & { end_date: string | null; status: string })[],
  };
}
