import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { recordOfflineGift } from "@/lib/admin/finance-actions";
import { OFFLINE_METHODS } from "@/lib/admin/finance-logic";
import { CheckInput, SimpleForm, TextInput } from "@/components/donor/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record offline gift" };
const sel = "mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2";

export default async function OfflineGiftPage() {
  const { perms } = await requirePermission("finance.view");
  const { data: projects } = await createSupabaseAdminClient().from("projects").select("id, title").neq("status", "archived").order("title");
  return (
    <>
      <h1 className="text-3xl font-semibold">Record offline gift</h1>
      <p className="mt-2 max-w-prose text-ink-soft">For checks, cash and wires received outside the website. The gift is counted as settled revenue on the date received, gets a final receipt, and is recorded in the audit log.</p>
      {!perms.has("expenses.record") && <p role="alert" className="mt-4 rounded-md bg-warning-bg p-3 text-warning">Your role can view finance data but cannot record entries.</p>}
      <div className="mt-6 max-w-xl"><SimpleForm action={recordOfflineGift} submit="Record gift">
        <TextInput label="Donor email" name="email" type="email" required />
        <div className="grid gap-4 sm:grid-cols-2"><TextInput label="First name (only for a new donor)" name="first_name" /><TextInput label="Last name (only for a new donor)" name="last_name" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Amount (USD)" name="amount" required />
          <div><label htmlFor="date" className="block font-semibold">Date received</label><input id="date" type="date" name="date" required className={sel} /></div>
        </div>
        <div><label htmlFor="project" className="block font-semibold">Designation</label><select id="project" name="project_id" className={sel}><option value="">General Fund</option>{(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="method" className="block font-semibold">Received as</label><select id="method" name="method" className={sel}>{OFFLINE_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          <TextInput label="Check or reference number" name="reference" />
        </div>
        <CheckInput label="Email the donor a receipt" name="send_receipt" />
      </SimpleForm></div>
    </>
  );
}
