import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { recordOfflineGift } from "@/lib/admin/finance-actions";
import { OFFLINE_METHODS } from "@/lib/admin/finance-logic";
import { SimpleForm, TextInput } from "@/components/donor/forms";
import { isPlaceholderEmail } from "@/lib/admin/dp-import";
import { loadThankYouChoices } from "@/lib/admin/thank-you-templates";
import { ThankYouPicker } from "@/components/admin/thank-you-picker";
import { DesignationSelect } from "@/components/admin/designation-select";

export const dynamic = "force-dynamic";
export const metadata = { title: "Record offline gift" };
const sel = "mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2";

export default async function OfflineGiftPage({ searchParams }: { searchParams: Promise<{ donor?: string }> }) {
  const { perms } = await requirePermission("finance.view");
  const sp = await searchParams;
  const db = createSupabaseAdminClient();
  // Opened from a donor's Gifts tab (?donor=): their email is filled in.
  const [{ data: projects }, { data: donor }] = await Promise.all([
    db.from("projects").select("id, title").neq("status", "archived").neq("kind", "sponsorship").order("title"),
    sp.donor && /^[0-9a-f-]{36}$/i.test(sp.donor) ? db.from("donor_profiles").select("email, first_name, last_name").eq("id", sp.donor).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const thankYouTemplates = await loadThankYouChoices(donor ? { firstName: donor.first_name, lastName: donor.last_name } : undefined);
  return (
    <>
      <h1 className="text-3xl font-semibold">Record offline gift</h1>
      <p className="mt-2 max-w-prose text-ink-soft">For checks, cash and wires received outside the website. The gift is counted as settled revenue on the date received, gets a final receipt, and is recorded in the audit log.</p>
      {!perms.has("expenses.record") && <p role="alert" className="mt-4 rounded-md bg-warning-bg p-3 text-warning">Your role can view finance data but cannot record entries.</p>}
      <div className="mt-6 max-w-xl"><SimpleForm action={recordOfflineGift} submit="Record gift">
        <TextInput label="Donor email" name="email" type="email" required defaultValue={donor && !isPlaceholderEmail(donor.email) ? donor.email : undefined} />
        <div className="grid gap-4 sm:grid-cols-2"><TextInput label="First name (only for a new donor)" name="first_name" /><TextInput label="Last name (only for a new donor)" name="last_name" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Amount (USD)" name="amount" required />
          <div><label htmlFor="date" className="block font-semibold">Date received</label><input id="date" type="date" name="date" required className={sel} /></div>
        </div>
        <DesignationSelect projects={projects ?? []} className={sel} names={{ projectId: "project_id", newDesignation: "new_designation" }} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="method" className="block font-semibold">Received as</label><select id="method" name="method" className={sel}>{OFFLINE_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          <TextInput label="Check or reference number" name="reference" />
        </div>
        <ThankYouPicker templates={thankYouTemplates} name="thank_you_template" noneHint="Optional. Without one, no email is sent to the donor." />
      </SimpleForm></div>
    </>
  );
}
