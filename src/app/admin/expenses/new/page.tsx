import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ExpenseForm } from "@/components/admin/expense-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record expense" };

export default async function NewExpensePage() {
  await requirePermission("expenses.record");
  const db = createSupabaseAdminClient();
  const [{ data: categories }, { data: projects }] = await Promise.all([
    db.from("expense_categories").select("id, name").eq("active", true).order("sort_order").order("name"),
    db.from("projects").select("id, title").neq("status", "archived").order("title"),
  ]);
  return (
    <>
      <p><Link className="underline" href="/admin/expenses">← All expenses</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">Record expense</h1>
      <p className="mt-1 text-sm text-ink-soft">New expenses start as pending and are excluded from reports until approved.</p>
      <div className="mt-6 max-w-2xl"><ExpenseForm categories={categories ?? []} projects={projects ?? []} /></div>
    </>
  );
}
