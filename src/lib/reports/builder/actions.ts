"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { loadBuilderRows } from "./data";
import { runDefinition, type ReportResult } from "./engine";
import { definitionSchema, restrictDefinition, type ReportDefinition } from "./fields";

/** Rows shown on screen; exports include every row. */
const PREVIEW_ROWS = 1000;
const MIGRATION_HINT = "Could not save the report. (Has database migration 0024 been applied?)";

export type RunResult = { ok: true; result: ReportResult; removed: string[]; def: ReportDefinition } | { ok: false; error: string };

/** Runs a report from the builder. Personal details are dropped for staff without donors.view. */
export async function runBuilderReport(raw: unknown): Promise<RunResult> {
  const { perms } = await requirePermission("reports.view");
  const parsed = definitionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const canViewDonors = perms.has("donors.view");
  const { def, removed } = restrictDefinition(parsed.data, canViewDonors);
  if (def.columns.length === 0) return { ok: false, error: "Choose at least one column you have access to." };
  const { rows, today } = await loadBuilderRows(def.source, canViewDonors);
  return { ok: true, result: runDefinition(rows, def, { today, limit: PREVIEW_ROWS }), removed, def };
}

const saveSchema = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1, "Name the report").max(120), shared: z.boolean(), definition: definitionSchema });

/** Saves a new report, or updates one the signed-in staff member saved. */
export async function saveBuilderReport(raw: unknown): Promise<{ ok: true; id: string; message: string } | { ok: false; error: string }> {
  const { user, perms } = await requirePermission("reports.view");
  const p = saveSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { def } = restrictDefinition(p.data.definition, perms.has("donors.view"));
  const db = createSupabaseAdminClient();
  const row = { name: p.data.name, shared: p.data.shared, definition: def };
  let id = p.data.id;
  if (id) {
    const { data, error } = await db.from("saved_reports").update(row).eq("id", id).eq("created_by", user.id).select("id").maybeSingle();
    if (error) return { ok: false, error: MIGRATION_HINT };
    if (!data) return { ok: false, error: "Only the person who saved a report can change it. Use Save as new instead." };
  } else {
    const { data, error } = await db.from("saved_reports").insert({ ...row, created_by: user.id }).select("id").single();
    if (error || !data) return { ok: false, error: MIGRATION_HINT };
    id = data.id as string;
  }
  await audit(user.id, "settings.change", "saved_report", id, { name: p.data.name, shared: p.data.shared });
  revalidatePath("/admin/reports/builder");
  return { ok: true, id, message: `Saved "${p.data.name}".` };
}

/** Deletes a report the signed-in staff member saved. */
export async function deleteBuilderReport(id: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requirePermission("reports.view");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Report not found." };
  const { error } = await createSupabaseAdminClient().from("saved_reports").delete().eq("id", id).eq("created_by", user.id);
  if (error) return { ok: false, error: "Could not delete the report." };
  revalidatePath("/admin/reports/builder");
  return { ok: true };
}
