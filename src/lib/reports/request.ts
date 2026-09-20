import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getOrgSettings, getSetting } from "@/lib/settings";
import { defaultRange } from "@/lib/admin/metrics";
import { loadReportData } from "./data";
import { buildFinancialReport, parseReportFilters } from "./financials";
import { buildSections, describeFilters, REPORT_TITLES, type ReportType } from "./sections";

export const parseType = (v: string | null | undefined): ReportType => (v === "soa" ? "soa" : "pl");

/**
 * Shared by the on-screen report and the CSV/PDF export so they always use identical filters and data.
 * `perms` gates the donor filter: looking a donor up by email requires donors.view.
 */
export async function runReport(sp: Record<string, string | undefined>, perms: Set<string>) {
  const settings = await getOrgSettings();
  const canFilterDonor = perms.has("donors.view");
  const params = { ...sp };
  if (canFilterDonor && sp.donor_email?.trim()) {
    const { data } = await createSupabaseAdminClient().from("donor_profiles").select("id").eq("normalized_email", sp.donor_email.trim().toLowerCase()).maybeSingle();
    params.donor = data?.id ?? "00000000-0000-0000-0000-000000000000"; // unknown email -> matches nothing rather than everything
  }
  const fiscalStartMonth = Math.min(12, Math.max(1, Number(await getSetting("fiscal_year_start_month")) || 1));
  const data = await loadReportData();
  const filters = parseReportFilters(params, defaultRange(new Date(), settings.timezone), canFilterDonor);
  const report = buildFinancialReport({
    donations: data.donations, expenses: data.expenses, budgets: data.budgets, categories: data.categories,
    tz: settings.timezone, fiscalStartMonth, filters,
  });
  const type = parseType(sp.type);
  const names = {
    fund: data.funds.find((x) => x.id === filters.fundId)?.name, project: data.projects.find((x) => x.id === filters.projectId)?.title,
    category: data.categories.find((x) => x.id === filters.categoryId)?.name,
  };
  return { settings, data, filters, report, type, title: REPORT_TITLES[type], sections: buildSections(report, type), filterLines: describeFilters(filters, names) };
}
