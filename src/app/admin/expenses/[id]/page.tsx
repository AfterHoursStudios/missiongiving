import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { archiveExpense } from "@/lib/admin/expense-actions";
import { ExpenseForm } from "@/components/admin/expense-form";
import { SimpleForm } from "@/components/donor/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expense" };

export default async function EditExpensePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ warn?: string }> }) {
  await requirePermission("expenses.record");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const db = createSupabaseAdminClient();
  const [{ data: e }, { data: categories }, { data: projects }] = await Promise.all([
    db.from("expenses").select("*").eq("id", id).is("archived_at", null).maybeSingle(),
    db.from("expense_categories").select("id, name").order("sort_order").order("name"),
    db.from("projects").select("id, title").neq("status", "archived").order("title"),
  ]);
  if (!e) notFound();
  const { data: names } = await db.from("profiles").select("id, email").in("id", [e.created_by, e.approved_by].filter(Boolean));
  const who = (uid: string | null) => names?.find((n) => n.id === uid)?.email ?? "—";
  return (
    <>
      <p><Link className="underline" href="/admin/expenses">← All expenses</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">{e.vendor}</h1>
      {(await searchParams).warn === "receipt" && <p role="alert" className="mt-3 rounded-md bg-warning-bg p-3 text-warning">The expense was saved, but the receipt file was rejected (use PDF, PNG, JPEG or WebP up to 5 MB). Attach it again below.</p>}
      <p className="mt-1 text-ink-soft">Status: <strong>{e.approval}</strong> · entered by {who(e.created_by)} · approved by {who(e.approved_by)}</p>
      <p className="text-sm text-ink-soft">Editing an approved or rejected expense sends it back to pending for approval.</p>
      <div className="mt-6 max-w-2xl"><ExpenseForm expense={e} categories={categories ?? []} projects={projects ?? []} /></div>
      <div className="mt-10 max-w-md"><SimpleForm action={archiveExpense} submit="Archive expense" tone="danger"><input type="hidden" name="id" value={id} /></SimpleForm>
        <p className="mt-1 text-sm text-ink-soft">Archived expenses are removed from reports but kept in the database.</p></div>
    </>
  );
}
