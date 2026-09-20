import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { completeDeletion, rejectDeletion } from "@/lib/admin/privacy-actions";
import { SimpleForm, TextInput } from "@/components/donor/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy requests" };

export default async function PrivacyPage() {
  await requirePermission("donors.edit");
  const db = createSupabaseAdminClient();
  const { data } = await db.from("data_requests").select("id, kind, status, created_at, note, donor_profiles(id, first_name, last_name, email)").order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  const open = rows.filter((r) => r.kind === "deletion" && ["open", "in_progress"].includes(r.status));
  const done = rows.filter((r) => !open.includes(r));
  const donor = (r: (typeof rows)[number]) => (Array.isArray(r.donor_profiles) ? r.donor_profiles[0] : r.donor_profiles) as { id: string; first_name: string; last_name: string; email: string } | null;

  return (
    <>
      <h1 className="text-3xl font-semibold">Privacy requests</h1>
      <p className="mt-2 max-w-prose text-ink-soft">Approving a deletion removes the donor&apos;s name, contact details, notes, tags, dedication names and login. Gift amounts, dates and receipts are kept for financial and tax records. This cannot be undone.</p>
      <h2 className="mt-8 text-2xl font-semibold">Open deletion requests</h2>
      {open.length === 0 ? <p className="mt-3 border-y border-line py-8 text-center text-ink-soft">No open requests.</p> : (
        <ul className="mt-4 space-y-8">{open.map((r) => {
          const d = donor(r);
          return (
            <li key={r.id} className="border-l-4 border-warning pl-4">
              <p className="font-semibold">{d ? <Link className="underline" href={`/admin/donors/${d.id}`}>{d.first_name} {d.last_name}</Link> : "Unknown donor"} <span className="font-normal text-ink-soft">{d?.email} · requested {new Date(r.created_at).toLocaleDateString("en-US")}</span></p>
              <div className="mt-3 flex flex-wrap gap-8">
                <details><summary className="min-h-11 cursor-pointer py-2 font-semibold text-danger underline">Approve and anonymize</summary>
                  <div className="mt-2 max-w-xs"><SimpleForm action={completeDeletion} submit="Anonymize donor" tone="danger"><input type="hidden" name="requestId" value={r.id} /><TextInput label="Type ANONYMIZE to confirm" name="confirm" /></SimpleForm></div></details>
                <details><summary className="min-h-11 cursor-pointer py-2 font-semibold underline">Reject</summary>
                  <div className="mt-2 max-w-xs"><SimpleForm action={rejectDeletion} submit="Close request"><input type="hidden" name="requestId" value={r.id} /><TextInput label="Reason" name="note" /></SimpleForm></div></details>
              </div>
            </li>);
        })}</ul>
      )}
      {done.length > 0 && (<><h2 className="mt-12 text-2xl font-semibold">History</h2>
        <ul className="mt-3 divide-y divide-line border-y border-line text-sm">{done.map((r) => <li key={r.id} className="py-2">{r.kind} · {r.status} · {new Date(r.created_at).toLocaleDateString("en-US")}{r.note ? ` · ${r.note}` : ""}</li>)}</ul></>)}
    </>
  );
}
