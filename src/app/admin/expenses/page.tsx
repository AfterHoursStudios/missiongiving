import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { decideExpense } from "@/lib/admin/expense-actions";
import { SimpleForm } from "@/components/donor/forms";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Expenses" };
const sel = "min-h-11 rounded-md border border-ink-soft bg-white px-2";
const PAGE = 30;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { perms } = await requirePermission("expenses.record");
  const sp = await searchParams;
  const db = createSupabaseAdminClient();
  const page = Math.max(1, Number(sp.page) || 1);
  let q = db.from("expenses").select("id, expense_date, vendor, description, amount_cents, approval, restriction, receipt_path, expense_categories(name), projects(title)", { count: "exact" })
    .is("archived_at", null).order("expense_date", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (["pending", "approved", "rejected"].includes(sp.status ?? "")) q = q.eq("approval", sp.status!);
  if (sp.category && /^[0-9a-f-]{36}$/i.test(sp.category)) q = q.eq("category_id", sp.category);
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) q = q.gte("expense_date", sp.from);
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) q = q.lte("expense_date", sp.to);
  const [{ data, count }, { data: cats }] = await Promise.all([q, db.from("expense_categories").select("id, name").order("sort_order").order("name")]);
  const rel = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number) => `?${new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>), page: String(p) })}`;
  const canApprove = perms.has("finance.view");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Expenses</h1>
        <div className="flex gap-4"><Link className="underline" href="/admin/expenses/categories">Categories and budgets</Link>
          <Link href="/admin/expenses/new" className="min-h-11 rounded-md bg-brand-700 px-5 py-2.5 font-semibold text-white">Record expense</Link></div>
      </div>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">Only approved expenses appear in reports. Expenses are archived, never deleted.</p>

      <form method="get" role="search" aria-label="Filter expenses" className="mt-4 flex flex-wrap items-end gap-3">
        <div><label htmlFor="status" className="block text-sm font-semibold">Approval</label><select id="status" name="status" defaultValue={sp.status ?? ""} className={sel}><option value="">All</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>
        <div><label htmlFor="category" className="block text-sm font-semibold">Category</label><select id="category" name="category" defaultValue={sp.category ?? ""} className={sel}><option value="">All</option>{(cats ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label htmlFor="from" className="block text-sm font-semibold">From</label><input id="from" type="date" name="from" defaultValue={sp.from} className={sel} /></div>
        <div><label htmlFor="to" className="block text-sm font-semibold">To</label><input id="to" type="date" name="to" defaultValue={sp.to} className={sel} /></div>
        <button className="min-h-11 rounded-md bg-teal-800 px-5 font-semibold text-white">Apply</button>
      </form>

      {(data ?? []).length === 0 ? <p className="mt-8 border-y border-line py-10 text-center text-ink-soft">No expenses match.</p> : (
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[46rem] text-left">
          <caption className="sr-only">Expenses</caption>
          <thead><tr className="border-b-2 border-ink">{["Date", "Vendor", "Category", "Amount", "Class", "Approval", "Receipt", ""].map((h, i) => <th key={i} scope="col" className="py-2 pr-4">{h}</th>)}</tr></thead>
          <tbody>{(data ?? []).map((e) => (
            <tr key={e.id} className="border-b border-line align-top">
              <td className="py-2 pr-4">{e.expense_date}</td>
              <td className="py-2 pr-4"><Link className="font-semibold underline" href={`/admin/expenses/${e.id}`}>{e.vendor}</Link>{e.description && <span className="block text-sm text-ink-soft">{e.description}</span>}</td>
              <td className="py-2 pr-4">{rel<{ name: string }>(e.expense_categories)?.name}{rel<{ title: string }>(e.projects) && <span className="block text-sm text-ink-soft">{rel<{ title: string }>(e.projects)!.title}</span>}</td>
              <td className="py-2 pr-4 font-semibold">{formatMoney(e.amount_cents)}</td>
              <td className="py-2 pr-4">{e.restriction}</td>
              <td className="py-2 pr-4">{e.approval}</td>
              <td className="py-2 pr-4">{e.receipt_path ? <a className="underline" href={`/admin/expenses/${e.id}/receipt`} target="_blank" rel="noopener">View</a> : "—"}</td>
              <td className="py-2">{canApprove && e.approval === "pending" && (
                <div className="flex gap-2">
                  <SimpleForm action={decideExpense} submit="Approve"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="approved" /></SimpleForm>
                  <SimpleForm action={decideExpense} submit="Reject" tone="danger"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="rejected" /></SimpleForm>
                </div>)}</td>
            </tr>))}</tbody></table></div>
      )}
      {pages > 1 && <nav aria-label="Pagination" className="mt-4 flex items-center gap-4">{page > 1 && <Link className="underline" href={href(page - 1)}>Previous</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="underline" href={href(page + 1)}>Next</Link>}</nav>}
    </>
  );
}
