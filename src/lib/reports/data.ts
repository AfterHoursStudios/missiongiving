import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { FBudget, FDonation, FExpense, FunctionalClass, Restriction } from "./financials";

const one = <T,>(v: T | T[] | null | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * Report source data. Callers MUST have passed requirePermission("reports.view"). Uses the service role and selects no
 * donor names/emails, so aggregate reporting doesn't expose personal information.
 */
export async function loadReportData() {
  const db = createSupabaseAdminClient();
  const [d, e, b, c, funds, projects] = await Promise.all([
    db.from("donations").select("id, donor_id, amount_cents, refunded_cents, fee_cents, status, frequency, payment_method, is_offline, fund_id, project_id, settled_at, donated_at, funds(name, restriction), projects(title)").is("archived_at", null).limit(100000),
    db.from("expenses").select("id, expense_date, amount_cents, category_id, project_id, restriction, approval, expense_categories(name, functional_class), projects(title)").is("archived_at", null).limit(100000),
    db.from("budgets").select("fiscal_year, category_id, amount_cents").is("project_id", null),
    db.from("expense_categories").select("id, name, functional_class, active, sort_order").order("sort_order").order("name"),
    db.from("funds").select("id, name").order("name"),
    db.from("projects").select("id, title").order("title"),
  ]);
  if (d.error) throw new Error(d.error.message);

  const donations: FDonation[] = (d.data ?? []).map((r) => {
    const fund = one<{ name: string; restriction: Restriction }>(r.funds);
    return {
      id: r.id, donor_id: r.donor_id, amount_cents: r.amount_cents, refunded_cents: r.refunded_cents, fee_cents: r.fee_cents, status: r.status,
      frequency: r.frequency, payment_method: r.payment_method, is_offline: r.is_offline, fund_id: r.fund_id,
      fund_name: fund?.name ?? "General Fund", restriction: fund?.restriction ?? "unrestricted",
      project_id: r.project_id, project_title: one<{ title: string }>(r.projects)?.title ?? null, settled_at: r.settled_at, donated_at: r.donated_at,
    };
  });
  const expenses: FExpense[] = (e.data ?? []).map((r) => {
    const cat = one<{ name: string; functional_class: FunctionalClass }>(r.expense_categories);
    return {
      id: r.id, expense_date: r.expense_date, amount_cents: r.amount_cents, category_id: r.category_id, category_name: cat?.name ?? "Uncategorized",
      functional_class: cat?.functional_class ?? "management", project_id: r.project_id, project_title: one<{ title: string }>(r.projects)?.title ?? null,
      restriction: r.restriction, approval: r.approval,
    };
  });
  return {
    donations, expenses, budgets: (b.data ?? []) as FBudget[],
    categories: (c.data ?? []) as { id: string; name: string; functional_class: FunctionalClass; active: boolean; sort_order: number }[],
    funds: (funds.data ?? []) as { id: string; name: string }[], projects: (projects.data ?? []) as { id: string; title: string }[],
  };
}
