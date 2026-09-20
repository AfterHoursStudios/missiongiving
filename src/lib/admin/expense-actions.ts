"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/money";
import { approvalAfterEdit, canApproveExpense, expenseSchema, expenseToRow, validateUpload } from "./expense-logic";
import { isSuperAdmin } from "./roles";
import type { AdminState } from "./donor-actions";

const BUCKET = "expense-receipts";
const uuid = z.string().uuid();

async function storeReceipt(expenseId: string, file: File): Promise<{ path: string } | { error: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateUpload(bytes);
  if (!v.ok) return { error: v.error };
  const path = `${expenseId}/${randomUUID()}.${v.kind.ext}`; // server-generated name; the client's filename is never used
  const { error } = await createSupabaseAdminClient().storage.from(BUCKET).upload(path, bytes, { contentType: v.kind.mime, upsert: false });
  return error ? { error: "Could not store the receipt file." } : { path };
}

export async function saveExpense(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("expenses.record");
  const parsed = expenseSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const row = expenseToRow(parsed.data);
  const db = createSupabaseAdminClient();
  const file = form.get("receipt");
  const hasFile = file instanceof File && file.size > 0;
  const id = form.get("id");

  const { data: cat } = await db.from("expense_categories").select("id, active").eq("id", row.category_id).maybeSingle();
  if (!cat || !cat.active) return { error: "Choose an active category." };

  if (typeof id === "string" && id) {
    if (!uuid.safeParse(id).success) return { error: "Expense not found." };
    const { data: cur } = await db.from("expenses").select("approval, receipt_path").eq("id", id).is("archived_at", null).maybeSingle();
    if (!cur) return { error: "Expense not found." };
    let receipt_path = cur.receipt_path as string | null;
    if (hasFile) {
      const stored = await storeReceipt(id, file);
      if ("error" in stored) return { error: stored.error };
      if (receipt_path) await db.storage.from(BUCKET).remove([receipt_path]);
      receipt_path = stored.path;
    }
    const approval = approvalAfterEdit(cur.approval);
    const { error } = await db.from("expenses").update({ ...row, receipt_path, approval, ...(approval === "pending" ? { approved_by: null } : {}) }).eq("id", id);
    if (error) return { error: "Could not save the expense." };
    await audit(user.id, "expense.update", "expense", id, { amount_cents: row.amount_cents, resubmitted: cur.approval !== approval });
    revalidatePath("/admin/expenses");
    return { ok: true, message: approval !== cur.approval ? "Saved. It needs approval again." : "Expense saved." };
  }

  const { data, error } = await db.from("expenses").insert({ ...row, created_by: user.id, approval: "pending" }).select("id").single();
  if (error || !data) return { error: "Could not save the expense." };
  if (hasFile) {
    const stored = await storeReceipt(data.id, file);
    if ("error" in stored) { redirect(`/admin/expenses/${data.id}?warn=receipt`); }
    else await db.from("expenses").update({ receipt_path: stored.path }).eq("id", data.id);
  }
  await audit(user.id, "expense.create", "expense", data.id, { amount_cents: row.amount_cents, category_id: row.category_id });
  revalidatePath("/admin/expenses");
  redirect("/admin/expenses");
}

export async function decideExpense(_: AdminState, form: FormData): Promise<AdminState> {
  const { user, perms } = await requirePermission("expenses.record");
  const p = z.object({ id: uuid, decision: z.enum(["approved", "rejected"]) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Invalid request." };
  const db = createSupabaseAdminClient();
  const { data: e } = await db.from("expenses").select("created_by, approval").eq("id", p.data.id).is("archived_at", null).maybeSingle();
  if (!e) return { error: "Expense not found." };
  if (e.approval !== "pending") return { error: "Only pending expenses can be approved or rejected." };
  const rule = canApproveExpense({ actorId: user.id, creatorId: e.created_by, hasFinanceView: perms.has("finance.view"), isSuperAdmin: await isSuperAdmin(user.id) });
  if (!rule.ok) return { error: rule.reason };
  await db.from("expenses").update({ approval: p.data.decision, approved_by: user.id }).eq("id", p.data.id).eq("approval", "pending");
  await audit(user.id, "expense.update", "expense", p.data.id, { decision: p.data.decision, self_approved: e.created_by === user.id });
  revalidatePath("/admin/expenses");
  return { ok: true, message: p.data.decision === "approved" ? "Approved." : "Rejected." };
}

/** Expenses are archived, never deleted (financial record). Archived rows drop out of reports. */
export async function archiveExpense(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("expenses.record");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return { error: "Expense not found." };
  await createSupabaseAdminClient().from("expenses").update({ archived_at: new Date().toISOString() }).eq("id", id.data);
  await audit(user.id, "expense.update", "expense", id.data, { archived: true });
  revalidatePath("/admin/expenses");
  return { ok: true, message: "Expense archived." };
}

const categorySchema = z.object({
  id: uuid.optional(), name: z.string().trim().min(1, "Enter a name").max(80),
  functional_class: z.enum(["program", "fundraising", "management"]), active: z.preprocess((v) => v === "on", z.boolean()),
  sort_order: z.coerce.number().int().min(0).max(1000).default(0),
});
export async function saveCategory(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("expenses.record");
  const raw = Object.fromEntries(form); if (!raw.id) delete raw.id;
  const p = categorySchema.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0].message };
  const { id, ...v } = p.data;
  const row = { ...v, is_program: v.functional_class === "program" };
  const db = createSupabaseAdminClient();
  const { error } = id ? await db.from("expense_categories").update(row).eq("id", id) : await db.from("expense_categories").insert(row);
  if (error) return { error: error.code === "23505" ? "A category with that name already exists." : "Could not save the category." };
  await audit(user.id, "expense.update", "expense_category", id, { name: v.name, functional_class: v.functional_class, active: v.active });
  revalidatePath("/admin/expenses/categories");
  return { ok: true, message: "Category saved." };
}

const budgetSchema = z.object({ categoryId: uuid, year: z.coerce.number().int().min(2000).max(2100), amount: z.string().trim() });
export async function saveBudget(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("expenses.record");
  const p = budgetSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Enter a category, fiscal year and amount." };
  let cents: number;
  try { cents = p.data.amount === "" ? 0 : dollarsToCents(p.data.amount); } catch { return { error: "Enter an amount like 5000 or 5000.00." }; }
  const db = createSupabaseAdminClient();
  const { data: cur } = await db.from("budgets").select("id").eq("fiscal_year", p.data.year).eq("category_id", p.data.categoryId).is("project_id", null).maybeSingle();
  const { error } = cur ? await db.from("budgets").update({ amount_cents: cents }).eq("id", cur.id) : await db.from("budgets").insert({ fiscal_year: p.data.year, category_id: p.data.categoryId, amount_cents: cents });
  if (error) return { error: "Could not save the budget." };
  await audit(user.id, "expense.update", "budget", p.data.categoryId, { fiscal_year: p.data.year, amount_cents: cents });
  revalidatePath("/admin/expenses/categories");
  return { ok: true, message: "Budget saved." };
}
