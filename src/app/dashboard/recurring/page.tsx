import Link from "next/link";
import { getDonorContext } from "@/lib/donor/context";
import { getOrgSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { cancelRecurring, openPaymentMethodPortal, updateRecurringAmount } from "@/lib/donor/actions";
import { CancelRecurringForm, ChangeAmountForm } from "@/components/donor/forms";
import { Empty, FREQUENCY_LABEL } from "@/components/donor/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recurring gifts" };

const STATUS_TEXT: Record<string, string> = {
  active: "Active", past_due: "Payment failed. Please update your payment method", paused: "Paused",
  canceled: "Canceled", completed: "Completed", incomplete: "Awaiting first payment",
};

export default async function RecurringPage({ searchParams }: { searchParams: Promise<{ portal?: string }> }) {
  const { portal } = await searchParams;
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
      {portal && <p role="alert" className="mt-4 rounded-md bg-warning-bg p-3 text-warning">
        {portal === "missing" ? "We couldn't find a payment profile for your account yet." : "The payment-method page is not available right now. Please contact us."}</p>}

      <h2 className="mt-8 text-2xl font-semibold">Active</h2>
      {current.length === 0 ? <Empty title="No active recurring gifts"><Link className="underline" href="/donate?frequency=monthly">Start a monthly gift</Link></Empty> : (
        <ul className="mt-4 space-y-6">
          {current.map((r) => (
            <li key={r.id} className="border-l-4 border-teal-600 pl-4">
              <p className="text-xl font-semibold">{formatMoney(r.amount_cents, settings.currency)} {FREQUENCY_LABEL[r.frequency].toLowerCase()} · {title(r)}</p>
              <p className={r.status === "past_due" ? "font-semibold text-danger" : "text-ink-soft"}>{STATUS_TEXT[r.status]}</p>
              {r.next_charge_at && r.status !== "incomplete" && <p>Next scheduled gift: <strong>{new Date(r.next_charge_at).toLocaleDateString("en-US", { timeZone: settings.timezone })}</strong></p>}
              {settings.recurring_amount_change_enabled && ["active", "past_due"].includes(r.status) &&
                <ChangeAmountForm id={r.id} current={r.amount_cents} action={updateRecurringAmount} />}
              <CancelRecurringForm id={r.id} action={cancelRecurring} />
            </li>
          ))}
          <li>
            <form action={openPaymentMethodPortal}>
              <button className="min-h-11 rounded-md border-2 border-teal-800 px-5 font-semibold text-teal-800">Update payment method</button>
            </form>
            <p className="mt-1 text-sm text-ink-soft">Opens Stripe&apos;s secure page for your card or bank account.</p>
          </li>
        </ul>
      )}

      {ended.length > 0 && (
        <>
          <h2 className="mt-12 text-2xl font-semibold">Canceled and completed</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {ended.map((r) => (
              <li key={r.id} className="py-3 text-ink-soft">
                {formatMoney(r.amount_cents, settings.currency)} {FREQUENCY_LABEL[r.frequency].toLowerCase()} · {title(r)} · {STATUS_TEXT[r.status]}
                {r.canceled_at && ` on ${new Date(r.canceled_at).toLocaleDateString("en-US", { timeZone: settings.timezone })}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
