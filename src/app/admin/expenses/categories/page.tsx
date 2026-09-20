import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { saveBudget, saveCategory } from "@/lib/admin/expense-actions";
import { CheckInput, SimpleForm, TextInput } from "@/components/donor/forms";
import { getSetting } from "@/lib/settings";
import { fiscalYearOf } from "@/lib/reports/financials";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Categories and budgets" };
const sel = "mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2";
const CLASSES = [["program", "Program services"], ["fundraising", "Fundraising"], ["management", "Management and general"]] as const;

export default async function CategoriesPage() {
  await requirePermission("expenses.record");
  const db = createSupabaseAdminClient();
  const [{ data: cats }, { data: budgets }, start] = await Promise.all([
    db.from("expense_categories").select("id, name, functional_class, active, sort_order").order("sort_order").order("name"),
    db.from("budgets").select("fiscal_year, category_id, amount_cents").is("project_id", null),
    getSetting("fiscal_year_start_month"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const fy = fiscalYearOf(today, Number(start) || 1);

  return (
    <>
      <p><Link className="underline" href="/admin/expenses">← Expenses</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">Categories and budgets</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">The functional class decides where an expense appears on the Statement of Activities. Fiscal year labels use the year the fiscal year starts (current: {fy}).</p>

      <ul className="mt-6 space-y-6">
        {(cats ?? []).map((c) => (
          <li key={c.id} className="border-l-4 border-teal-600 pl-4">
            <SimpleForm action={saveCategory} submit="Save category">
              <input type="hidden" name="id" value={c.id} />
              <div className="grid gap-4 sm:grid-cols-3">
                <TextInput label="Name" name="name" defaultValue={c.name} required />
                <div><label htmlFor={`fc-${c.id}`} className="block font-semibold">Functional class</label><select id={`fc-${c.id}`} name="functional_class" defaultValue={c.functional_class} className={sel}>{CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <TextInput label="Order" name="sort_order" defaultValue={String(c.sort_order)} />
              </div>
              <CheckInput label="Active (available for new expenses)" name="active" defaultChecked={c.active} />
            </SimpleForm>
            <div className="mt-3"><SimpleForm action={saveBudget} submit="Save budget">
              <input type="hidden" name="categoryId" value={c.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput label="Fiscal year" name="year" defaultValue={String(fy)} />
                <TextInput label="Annual budget (USD)" name="amount" defaultValue={(() => { const b = (budgets ?? []).find((x) => x.category_id === c.id && x.fiscal_year === fy); return b ? (b.amount_cents / 100).toFixed(2) : ""; })()} hint={`Current budget shown for FY ${fy}. Changing the year loads nothing; enter the amount for that year.`} />
              </div>
            </SimpleForm></div>
            <p className="mt-1 text-sm text-ink-soft">Budgets entered: {(budgets ?? []).filter((b) => b.category_id === c.id).map((b) => `FY${b.fiscal_year} ${formatMoney(b.amount_cents)}`).join(", ") || "none"}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="new" className="mt-12 max-w-xl">
        <h2 id="new" className="text-2xl font-semibold">Add a category</h2>
        <div className="mt-4"><SimpleForm action={saveCategory} submit="Add category">
          <TextInput label="Name" name="name" required />
          <div><label htmlFor="new-fc" className="block font-semibold">Functional class</label><select id="new-fc" name="functional_class" className={sel}>{CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <input type="hidden" name="active" value="on" />
        </SimpleForm></div>
      </section>
    </>
  );
}
