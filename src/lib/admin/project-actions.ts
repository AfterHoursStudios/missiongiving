"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { formatMoney } from "@/lib/money";
import { goalStatus, isPubliclyListed, offlineAdjustmentSchema, projectSchema, projectToRow, sanitizeStory } from "./project-schema";
import type { AdminState } from "./donor-actions";

export async function saveProject(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("projects.manage");
  const parsed = projectSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const row = projectToRow(parsed.data);
  const db = createSupabaseAdminClient();
  const id = form.get("id");

  if (typeof id === "string" && id) {
    if (!z.string().uuid().safeParse(id).success) return { error: "Project not found." };
    const { data: before } = await db.from("projects").select("status, is_public").eq("id", id).maybeSingle();
    if (!before) return { error: "Project not found." };
    const { error } = await db.from("projects").update(row).eq("id", id);
    if (error) return { error: error.code === "23505" ? "That URL slug is already used by another project." : "Could not save the project." };
    if (!isPubliclyListed(before) && isPubliclyListed(row)) await audit(user.id, "project.publish", "project", id, { status: row.status, slug: row.slug });
    revalidatePath("/admin/projects"); revalidatePath("/projects"); revalidatePath(`/projects/${row.slug}`);
    return { ok: true, message: "Project saved." };
  }

  // Each project gets its own restricted fund so restricted-revenue reporting works from day one.
  const { data: fund, error: fundErr } = await db.from("funds")
    .insert({ key: `project-${row.slug}`, name: row.title, restriction: "restricted" }).select("id").single();
  if (fundErr || !fund) return { error: fundErr?.code === "23505" ? "That URL slug is already used by another project." : "Could not create the project fund." };
  const { data, error } = await db.from("projects").insert({ ...row, fund_id: fund.id, created_by: user.id }).select("id").single();
  if (error || !data) {
    await db.from("funds").delete().eq("id", fund.id); // nothing references it yet
    return { error: error?.code === "23505" ? "That URL slug is already used by another project." : "Could not create the project." };
  }
  if (isPubliclyListed(row)) await audit(user.id, "project.publish", "project", data.id, { status: row.status, slug: row.slug });
  revalidatePath("/admin/projects");
  redirect(`/admin/projects/${data.id}`);
}

const updateSchema = z.object({
  projectId: z.string().uuid(), title: z.string().trim().min(1, "Enter a title").max(150),
  body: z.string().trim().min(1, "Write the update").max(20000), publish: z.string().optional(),
});

export async function addProjectUpdate(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("projects.manage");
  const p = updateSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const db = createSupabaseAdminClient();
  const { error } = await db.from("project_updates").insert({
    project_id: p.data.projectId, title: p.data.title, body_html: sanitizeStory(p.data.body),
    published_at: p.data.publish === "on" ? new Date().toISOString() : null, created_by: user.id,
  });
  if (error) return { error: "Could not save the update." };
  revalidatePath(`/admin/projects/${p.data.projectId}`);
  return { ok: true, message: p.data.publish === "on" ? "Update published." : "Draft saved." };
}

/** Manual financial adjustment: always explained, always audited, cumulative and visible in the project record. */
export async function adjustOffline(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("projects.manage");
  const p = offlineAdjustmentSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  if (p.data.amount === 0) return { error: "Enter a non-zero amount." };
  const db = createSupabaseAdminClient();
  const { data: proj } = await db.from("projects").select("offline_adjustment_cents, offline_adjustment_note").eq("id", p.data.id).maybeSingle();
  if (!proj) return { error: "Project not found." };
  const next = proj.offline_adjustment_cents + p.data.amount;
  if (next < 0) return { error: "Offline adjustments cannot total less than zero." };
  const line = `${new Date().toISOString().slice(0, 10)}: ${p.data.amount > 0 ? "+" : "-"}${formatMoney(Math.abs(p.data.amount))} — ${p.data.note}`;
  const { error } = await db.from("projects").update({
    offline_adjustment_cents: next, offline_adjustment_note: [proj.offline_adjustment_note, line].filter(Boolean).join("\n"),
  }).eq("id", p.data.id);
  if (error) return { error: "Could not save the adjustment." };
  await audit(user.id, "financial.adjustment", "project", p.data.id, { delta_cents: p.data.amount, total_cents: next, note: p.data.note });
  revalidatePath(`/admin/projects/${p.data.id}`); revalidatePath("/projects");
  return { ok: true, message: "Adjustment recorded and audited." };
}

/** Marks active projects whose confirmed total has reached the goal. Never reverts a status. */
export async function syncGoalStatuses() {
  const db = createSupabaseAdminClient();
  const { data: active } = await db.from("projects").select("id, goal_cents, offline_adjustment_cents, status").eq("status", "active").not("goal_cents", "is", null);
  for (const p of active ?? []) {
    const { data } = await db.rpc("project_totals", { p_project_id: p.id });
    const raised = Number(data?.[0]?.raised_cents ?? 0) + p.offline_adjustment_cents;
    const next = goalStatus(p.status, raised, p.goal_cents);
    if (next !== p.status) await db.from("projects").update({ status: next }).eq("id", p.id).eq("status", "active");
  }
}
