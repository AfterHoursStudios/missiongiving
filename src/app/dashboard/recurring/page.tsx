import Link from "next/link";
import { getDonorContext } from "@/lib/donor/context";
import { getOrgSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { cancelRecurring, updateRecurringAmount } from "@/lib/donor/actions";
import { CancelRecurringForm, ChangeAmountForm } from "@/components/donor/forms";
import { Empty, FREQUENCY_LABEL, Panel, StatusDot } from "@/components/donor/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recurring gifts" };

const STATUS_TEXT: Record<string, string> = {
  active: "Active", past_due: "Payment failed. Please update your payment method", paused: "Paused",
  canceled: "Canceled", completed: "Completed", incomplete: "Awaiting first payment",
};

export default async function RecurringPage() {
  const { supabase, donor } = await getDonorContext();
  const settings = await getOrgSettings();
  const { data } = donor
    ? await supabase.from("recurring_donations").select("id, amount_cents, frequency, status, next_charge_at, canceled_at, created_at, projects(title)")
        .eq("donor_id", donor.id).order("created_at", { ascending: false })
    : { data: [] };
  const all = data ?? [];
  const current = all.filter((r) => ["active", "past_due", "paused", "incomplete"].includes(r.status));
  const ended = all.filter((r) => ["canceled", "completed"].includes(r.status));
  const title = (r: (typeof all)[number]) => (r.projects as unknown as { title: string } | null)?.title ?? "General Fund";

  return (
    <>
      <h1 className="text-3xl font-semibold">Recurring gifts</h1>

      <h2 className="mt-8 text-xl font-bold">Active</h2>
      {current.length === 0 ? (
        <div className="mt-4"><Empty title="No active recurring gifts"><Link className="text-teal-600 underline" href="/dashboard/give?frequency=monthly">Start a monthly gift</Link></Empty></div>
      ) : (
        <>
          <ul className="mt-4 grid gap-4 lg:grid-cols-2">
            {current.map((r) => (
              <li key={r.id} className="rounded-lg border border-line bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-2xl font-semibold">{formatMoney(r.amount_cents, settings.currency)} <span className="text-base font-normal text-ink-soft">{FREQUENCY_LABEL[r.frequency].toLowerCase()}</span></p>
                    <p className="font-semibold">{title(r)}</p>
                  </div>
                  <StatusDot status={r.status} label={r.status === "past_due" ? "Payment failed" : r.status === "incomplete" ? "Awaiting first payment" : undefined} />
                </div>
                {r.status === "past_due" && <p className="mt-2 font-semibold text-danger">{STATUS_TEXT[r.status]}</p>}
                {r.next_charge_at && r.status !== "incomplete" && <p className="mt-2">Next scheduled gift: <strong>{new Date(r.next_charge_at).toLocaleDateString("en-US", { timeZone: settings.timezone })}</strong></p>}
                <div className="mt-2 border-t border-line pt-2">
                  {settings.recurring_amount_change_enabled && ["active", "past_due"].includes(r.status) &&
                    <ChangeAmountForm id={r.id} current={r.amount_cents} action={updateRecurringAmount} />}
                  <CancelRecurringForm id={r.id} action={cancelRecurring} />
                </div>
              </li>
            ))}
          </ul>
          <Panel className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-ink-soft">Need to change the card or bank account your gifts come from?</p>
              <Link href="/dashboard/payment-methods" className="inline-flex min-h-11 items-center rounded-md border-2 border-teal-800 bg-white px-5 font-semibold text-teal-800 hover:bg-paper-2">Update payment method</Link>
            </div>
          </Panel>
        </>
      )}

      {ended.length > 0 && (
        <Panel className="mt-10" title="Canceled and completed" id="ended" flush>
          <ul className="divide-y divide-line">
            {ended.map((r) => (
              <li key={r.id} className="px-4 py-3 text-ink-soft">
                {formatMoney(r.amount_cents, settings.currency)} {FREQUENCY_LABEL[r.frequency].toLowerCase()} · {title(r)} · {STATUS_TEXT[r.status]}
                {r.canceled_at && ` on ${new Date(r.canceled_at).toLocaleDateString("en-US", { timeZone: settings.timezone })}`}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
