import { TEMPLATE_VARIABLES, type TemplateVars } from "@/lib/messages";

/** Sample values for previews and test emails. Clearly fake; never real donor data. */
export const SAMPLE_VARS: Required<TemplateVars> = {
  donor_first_name: "Sample", donor_full_name: "Sample Donor", donation_amount: "$50.00", donation_date: "January 15, 2026",
  donation_frequency: "monthly", tier_name: "$50", project_name: "Sample Project", receipt_number: "MG-00001000",
  organization_name: "Mission Giving", dashboard_link: "https://example.org/dashboard", receipt_link: "https://example.org/receipts/sample/pdf",
};

/** Returns placeholders that are not supported variables (typos such as {{donor_name}}), so they can be rejected before saving. */
export function findUnknownVariables(...texts: string[]): string[] {
  const known = new Set<string>(TEMPLATE_VARIABLES);
  const unknown = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) if (!known.has(m[1])) unknown.add(m[1]);
  return [...unknown];
}

/**
 * Version numbering: history is append-only. A first edit snapshots the pre-edit content as v1 so the original is
 * restorable; restoring an old version creates a NEW version rather than rewriting history.
 */
export function planVersions(existingMax: number): { snapshotOriginal: boolean; newVersion: number } {
  return existingMax === 0 ? { snapshotOriginal: true, newVersion: 2 } : { snapshotOriginal: false, newVersion: existingMax + 1 };
}

/**
 * A new custom template's key, derived from its name. Every template key routes as `/admin/messages/[key]`, which
 * only matches lowercase letters and underscores (existing keys like `donation_success_one_time` are wired to
 * specific send events by that exact string) — so, unlike a URL slug, digits and hyphens are stripped, not kept.
 */
export function templateKeySlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "template";
}
