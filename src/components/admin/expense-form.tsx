import { SimpleForm, TextInput } from "@/components/donor/forms";
import { saveExpense } from "@/lib/admin/expense-actions";
import { PAYMENT_METHODS } from "@/lib/admin/expense-logic";

export interface ExpenseValues {
  id?: string; expense_date?: string; vendor?: string; description?: string | null; amount_cents?: number; category_id?: string;
  project_id?: string | null; restriction?: string; payment_method?: string | null; reference_number?: string | null; notes?: string | null; receipt_path?: string | null;
}
const selectCls = "mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2";
const area = "mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2";

export function ExpenseForm({ expense, categories, projects }: {
  expense?: ExpenseValues; categories: { id: string; name: string }[]; projects: { id: string; title: string }[];
}) {
  const e = expense ?? { restriction: "unrestricted", expense_date: new Date().toISOString().slice(0, 10) };
  return (
    <SimpleForm action={saveExpense} submit={expense?.id ? "Save expense" : "Record expense"}>
      {expense?.id && <input type="hidden" name="id" value={expense.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="date" className="block font-semibold">Date</label><input id="date" type="date" name="expense_date" required defaultValue={e.expense_date} className={selectCls} /></div>
        <TextInput label="Amount (USD)" name="amount" defaultValue={e.amount_cents != null ? (e.amount_cents / 100).toFixed(2) : ""} required />
      </div>
      <TextInput label="Vendor" name="vendor" defaultValue={e.vendor} required />
      <TextInput label="Description" name="description" defaultValue={e.description} />
      <div><label htmlFor="cat" className="block font-semibold">Category</label>
        <select id="cat" name="category_id" required defaultValue={e.category_id ?? ""} className={selectCls}><option value="" disabled>Choose…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      <div><label htmlFor="proj" className="block font-semibold">Program or project (optional)</label>
        <select id="proj" name="project_id" defaultValue={e.project_id ?? ""} className={selectCls}><option value="">Not project-specific</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="restr" className="block font-semibold">Classification</label>
          <select id="restr" name="restriction" defaultValue={e.restriction} className={selectCls}><option value="unrestricted">Unrestricted</option><option value="restricted">Restricted</option></select></div>
        <div><label htmlFor="pm" className="block font-semibold">Payment method</label>
          <select id="pm" name="payment_method" defaultValue={e.payment_method ?? ""} className={selectCls}><option value="">Not specified</option>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
      </div>
      <TextInput label="Reference or check number" name="reference_number" defaultValue={e.reference_number} />
      <div><label htmlFor="notes" className="block font-semibold">Internal notes</label><textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={e.notes ?? ""} className={area} /></div>
      <div><label htmlFor="receipt" className="block font-semibold">Receipt attachment (PDF, PNG, JPEG or WebP, up to 5 MB)</label>
        <input id="receipt" type="file" name="receipt" accept="application/pdf,image/png,image/jpeg,image/webp" className="mt-1.5 block w-full" />
        {expense?.receipt_path && <p className="mt-1 text-sm">A receipt is attached. <a className="underline" href={`/admin/expenses/${expense.id}/receipt`} target="_blank" rel="noopener">View</a>. Choosing a new file replaces it.</p>}</div>
    </SimpleForm>
  );
}
