import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { addNote, resendReceipt, setTag, updateDonor } from "@/lib/admin/donor-actions";
import { refundDonation } from "@/lib/admin/finance-actions";
import { validateRefund } from "@/lib/admin/finance-logic";
import { SimpleForm, TextInput } from "@/components/donor/forms";
import { StatusBadge, FREQUENCY_LABEL, METHOD_LABEL } from "@/components/donor/ui";
import { formatMoney, netSettledCents } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Donor" };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function DonorDetail({ params }: { params: Promise<{ id: string }> }) {
  const { perms } = await requirePermission("donors.view");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const db = createSupabaseAdminClient();
  const { data: donor } = await db.from("donor_profiles").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!donor) notFound();

  const [donations, recurring, notes, assigned, allTags, prefs] = await Promise.all([
    db.from("donations").select("id, amount_cents, refunded_cents, status, stripe_payment_intent_id, frequency, payment_method, donated_at, projects(title), receipts(receipt_number, is_final, delivery_history)").eq("donor_id", id).order("donated_at", { ascending: false }),
    db.from("recurring_donations").select("id, amount_cents, frequency, status, next_charge_at, projects(title)").eq("donor_id", id),
    db.from("donor_notes").select("id, body, created_at").eq("donor_id", id).order("created_at", { ascending: false }),
    db.from("donor_tag_assignments").select("donor_tags(id, name)").eq("donor_id", id),
    db.from("donor_tags").select("id, name").order("name"),
    db.from("communication_preferences").select("marketing_email, project_updates, annual_statement_email, suppressed").eq("donor_id", id).maybeSingle(),
  ]);
  const gifts = donations.data ?? [];
  const myTags = (assigned.data ?? []).map((a) => one<{ id: string; name: string }>(a.donor_tags)).filter(Boolean) as { id: string; name: string }[];
  const projects = [...new Set(gifts.map((g) => one<{ title: string }>(g.projects)?.title).filter(Boolean))];
  const canEdit = perms.has("donors.edit");
  const yn = (b?: boolean) => (b ? "Yes" : "No");

  return (
    <>
      <p><Link className="underline" href="/admin/donors">← All donors</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">{donor.first_name} {donor.last_name}</h1>
      <p className="text-ink-soft">{donor.email}{donor.phone ? ` · ${donor.phone}` : ""}</p>
      <dl className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
        <Fact label="Lifetime giving" value={formatMoney(netSettledCents(gifts))} />
        <Fact label="Status" value={donor.status.replace("_", " ")} />
        <Fact label="Projects supported" value={projects.length ? projects.join(", ") : "None"} />
        <Fact label="Household / organization" value={donor.organization_name ?? "—"} />
      </dl>

      <h2 className="mt-10 text-2xl font-semibold">Giving history</h2>
      {gifts.length === 0 ? <p className="mt-2 text-ink-soft">No gifts.</p> : (
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[40rem] text-left">
          <caption className="sr-only">Giving history</caption>
          <thead><tr className="border-b-2 border-ink">{["Date", "Amount", "Method", "Frequency", "Designation", "Status", "Receipt"].map((h) => <th key={h} scope="col" className="py-2 pr-4">{h}</th>)}</tr></thead>
          <tbody>{gifts.map((g) => {
            const rc = one<{ receipt_number: string; is_final: boolean; delivery_history: unknown[] }>(g.receipts);
            return (
              <tr key={g.id} className="border-b border-line align-top">
                <td className="py-2 pr-4">{new Date(g.donated_at).toLocaleDateString("en-US")}</td>
                <td className="py-2 pr-4 font-semibold">{formatMoney(g.amount_cents)}{g.refunded_cents > 0 && <span className="block text-sm font-normal text-warning">refunded {formatMoney(g.refunded_cents)}</span>}</td>
                <td className="py-2 pr-4">{METHOD_LABEL[g.payment_method]}</td>
                <td className="py-2 pr-4">{FREQUENCY_LABEL[g.frequency]}</td>
                <td className="py-2 pr-4">{one<{ title: string }>(g.projects)?.title ?? "General Fund"}</td>
                <td className="py-2 pr-4"><StatusBadge status={g.status} /></td>
                <td className="py-2">
                  {rc ? (<>
                    <a className="underline" href={`/receipts/${g.id}/pdf`}>{rc.receipt_number}</a>
                    <span className="block text-sm text-ink-soft">{rc.is_final ? "Final" : "Pending"} · sent {rc.delivery_history?.length ?? 0}×</span>
                    {canEdit && rc.is_final && <div className="mt-1"><SimpleForm action={resendReceipt} submit="Resend"><input type="hidden" name="donationId" value={g.id} /></SimpleForm></div>}
                  </>) : "—"}
                  {perms.has("refunds.issue") && !validateRefund({ status: g.status, payment_method: g.payment_method, amount_cents: g.amount_cents, refunded_cents: g.refunded_cents, has_payment_intent: !!g.stripe_payment_intent_id }, 1) && (
                    <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold text-danger underline">Refund</summary>
                      <div className="mt-2 w-56"><SimpleForm action={refundDonation} submit="Submit refund" tone="danger">
                        <input type="hidden" name="donationId" value={g.id} />
                        <TextInput label={`Amount (max ${((g.amount_cents - g.refunded_cents) / 100).toFixed(2)})`} name="amount" defaultValue={((g.amount_cents - g.refunded_cents) / 100).toFixed(2)} />
                        <TextInput label="Reason" name="reason" />
                      </SimpleForm></div></details>)}
                </td>
              </tr>);
          })}</tbody></table></div>
      )}

      <h2 className="mt-10 text-2xl font-semibold">Recurring gifts</h2>
      {(recurring.data ?? []).length === 0 ? <p className="mt-2 text-ink-soft">None.</p> : (
        <ul className="mt-3 divide-y divide-line border-y border-line">{(recurring.data ?? []).map((r) => (
          <li key={r.id} className="py-2">{formatMoney(r.amount_cents)} {FREQUENCY_LABEL[r.frequency].toLowerCase()} · {one<{ title: string }>(r.projects)?.title ?? "General Fund"} · {r.status.replace("_", " ")}{r.next_charge_at ? ` · next ${new Date(r.next_charge_at).toLocaleDateString("en-US")}` : ""}</li>
        ))}</ul>
      )}

      <h2 className="mt-10 text-2xl font-semibold">Communication preferences</h2>
      <p className="mt-2">News: {yn(prefs.data?.marketing_email)} · Project updates: {yn(prefs.data?.project_updates)} · Statement email: {yn(prefs.data?.annual_statement_email ?? true)}{prefs.data?.suppressed ? " · SUPPRESSED (bounce/complaint)" : ""}</p>

      <h2 className="mt-10 text-2xl font-semibold">Tags</h2>
      <ul className="mt-2 flex flex-wrap gap-2">{myTags.length === 0 && <li className="text-ink-soft">None</li>}{myTags.map((t) => (
        <li key={t.id} className="flex items-center gap-2 rounded bg-paper-2 px-2 py-1">{t.name}
          {canEdit && <SimpleForm action={setTag} submit="Remove"><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="remove" /><input type="hidden" name="tagId" value={t.id} /></SimpleForm>}</li>
      ))}</ul>
      {canEdit && (
        <div className="mt-3 max-w-md"><SimpleForm action={setTag} submit="Add tag">
          <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="add" />
          <label htmlFor="tagId" className="block font-semibold">Existing tag</label>
          <select id="tagId" name="tagId" className="min-h-11 w-full rounded-md border border-ink-soft bg-white px-2"><option value="">Choose…</option>{(allTags.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <TextInput label="Or create a new tag" name="newTag" />
        </SimpleForm></div>
      )}

      <h2 className="mt-10 text-2xl font-semibold">Internal notes</h2>
      <p className="text-sm text-ink-soft">Visible to staff only. Do not record payment card or bank numbers.</p>
      {canEdit && <div className="mt-3 max-w-xl"><SimpleForm action={addNote} submit="Add note"><input type="hidden" name="id" value={id} />
        <label htmlFor="body" className="block font-semibold">Note</label><textarea id="body" name="body" rows={3} maxLength={4000} required className="w-full rounded-md border border-ink-soft bg-white px-3 py-2" /></SimpleForm></div>}
      <ul className="mt-4 divide-y divide-line border-y border-line">{(notes.data ?? []).map((n) => (
        <li key={n.id} className="py-3"><p className="whitespace-pre-wrap">{n.body}</p><p className="text-sm text-ink-soft">{new Date(n.created_at).toLocaleString("en-US")}</p></li>
      ))}{(notes.data ?? []).length === 0 && <li className="py-3 text-ink-soft">No notes.</li>}</ul>

      {canEdit && (
        <details className="mt-10">
          <summary className="min-h-11 cursor-pointer py-2 text-2xl font-semibold">Correct donor information</summary>
          <p className="text-sm text-ink-soft">Nonfinancial details only. Email and payment data cannot be edited here.</p>
          <div className="mt-4 max-w-xl"><SimpleForm action={updateDonor} submit="Save changes">
            <input type="hidden" name="id" value={id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="First name" name="first_name" defaultValue={donor.first_name} required />
              <TextInput label="Last name" name="last_name" defaultValue={donor.last_name} required />
            </div>
            <TextInput label="Phone" name="phone" defaultValue={donor.phone} />
            <TextInput label="Household or organization" name="organization_name" defaultValue={donor.organization_name} />
            <TextInput label="Address line 1" name="address_line1" defaultValue={donor.address_line1} />
            <TextInput label="Address line 2" name="address_line2" defaultValue={donor.address_line2} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextInput label="City" name="city" defaultValue={donor.city} /><TextInput label="State/Region" name="region" defaultValue={donor.region} /><TextInput label="Postal code" name="postal_code" defaultValue={donor.postal_code} />
            </div>
            <label htmlFor="status" className="block font-semibold">Status</label>
            <select id="status" name="status" defaultValue={donor.status} className="min-h-11 w-full rounded-md border border-ink-soft bg-white px-2">
              {["active", "inactive", "lapsed", "do_not_contact"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
          </SimpleForm></div>
        </details>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm text-ink-soft">{label}</dt><dd className="text-lg font-semibold">{value}</dd></div>;
}
