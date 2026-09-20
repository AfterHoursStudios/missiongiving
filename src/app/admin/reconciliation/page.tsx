import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { classifyAttention, type ReconDonation, type ReconEvent, type ReconRecurring } from "@/lib/admin/reconcile";
import { retryWebhook } from "@/lib/admin/finance-actions";
import { SimpleForm } from "@/components/donor/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reconciliation" };
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const rel = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function ReconciliationPage() {
  await requirePermission("finance.view");
  const db = createSupabaseAdminClient();
  const since = daysAgo(60);
  const [don, rec, ev] = await Promise.all([
    db.from("donations").select("id, donor_id, amount_cents, refunded_cents, status, payment_method, frequency, donated_at, settled_at, donor_profiles(first_name, last_name), receipts(is_final)").is("archived_at", null).gte("donated_at", since).limit(5000),
    db.from("recurring_donations").select("id, donor_id, status, amount_cents, created_at, donor_profiles(first_name, last_name)").in("status", ["incomplete", "past_due"]),
    db.from("webhook_events").select("stripe_event_id, type, status, attempts, error, received_at").in("status", ["failed", "received"]).order("received_at", { ascending: false }).limit(200),
  ]);
  const name = (v: unknown) => { const p = rel<{ first_name: string; last_name: string }>(v as never); return p ? `${p.first_name} ${p.last_name}` : "Unknown"; };
  const donations: ReconDonation[] = (don.data ?? []).map((d) => ({
    id: d.id, donor_id: d.donor_id, donor_name: name(d.donor_profiles), amount_cents: d.amount_cents, refunded_cents: d.refunded_cents, status: d.status,
    payment_method: d.payment_method, frequency: d.frequency, donated_at: d.donated_at, settled_at: d.settled_at, has_final_receipt: !!rel<{ is_final: boolean }>(d.receipts)?.is_final,
  }));
  const recurring: ReconRecurring[] = (rec.data ?? []).map((r) => ({ id: r.id, donor_id: r.donor_id, donor_name: name(r.donor_profiles), status: r.status, amount_cents: r.amount_cents, created_at: r.created_at }));
  const groups = classifyAttention(donations, recurring, (ev.data ?? []) as ReconEvent[], new Date());

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Reconciliation</h1>
        <Link className="underline" href="/admin/offline-gift">Record offline gift</Link>
      </div>
      <p className="mt-2 max-w-prose text-ink-soft">Records from the last 60 days that need attention. Stripe is the source of truth for payment status; this page helps you notice when the two disagree.</p>
      {groups.length === 0 ? <p role="status" className="mt-8 rounded-md bg-success-bg p-6 text-center text-success">Nothing needs attention.</p> : (
        <div className="mt-8 space-y-10">
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`g-${g.id}`}>
              <h2 id={`g-${g.id}`} className="text-2xl font-semibold">{g.title} <span className="text-lg text-ink-soft">({g.items.length})</span></h2>
              <p className="text-sm text-ink-soft">{g.explanation}</p>
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {g.items.map((i) => (
                  <li key={i.key} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <span>{i.donorId ? <Link className="underline" href={`/admin/donors/${i.donorId}`}>{i.label}</Link> : i.label}<span className="block text-sm text-ink-soft">{i.detail}</span></span>
                    {i.eventId && <SimpleForm action={retryWebhook} submit="Retry"><input type="hidden" name="eventId" value={i.eventId} /></SimpleForm>}
                  </li>))}
              </ul>
            </section>))}
        </div>
      )}
    </>
  );
}
