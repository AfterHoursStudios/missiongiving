import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { pickConfirmationMessage } from "@/lib/messages";
import { STATUS_LABELS, isReceiptFinal, type DonationStatus } from "@/lib/donations/status";
import { AutoRefresh } from "@/components/donate/auto-refresh";

export const metadata: Metadata = { title: "Thank you", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const FREQ = { one_time: "One time", monthly: "Monthly", yearly: "Yearly" } as const;

export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ donation?: string }> }) {
  const { donation: id } = await searchParams;
  await requireUser();
  if (!id) notFound();

  // RLS guarantees a donor can only load their own donation; anything else returns no row.
  const supabase = await createSupabaseServerClient();
  const { data: d } = await supabase.from("donations")
    .select("id, amount_cents, frequency, status, payment_method, tier_id, project_id, receipts(receipt_number, is_final)")
    .eq("id", id).maybeSingle();
  if (!d) notFound();

  const [settings, { data: tier }, { data: project }] = await Promise.all([
    getOrgSettings(),
    d.tier_id ? supabase.from("donation_tiers").select("confirmation_message").eq("id", d.tier_id).maybeSingle() : Promise.resolve({ data: null }),
    d.project_id ? supabase.from("projects").select("title").eq("id", d.project_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const status = d.status as DonationStatus;
  const receipt = Array.isArray(d.receipts) ? d.receipts[0] : d.receipts;
  const inFlight = status === "pending" || status === "processing";
  const isAch = d.payment_method === "us_bank_account";
  const message = pickConfirmationMessage(tier?.confirmation_message, settings.default_thank_you);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {inFlight && <AutoRefresh />}
      <h1 className="text-4xl font-semibold">
        {status === "failed" ? "Your payment did not go through" : inFlight ? "We're confirming your gift" : "Thank you"}
      </h1>

      <div role="status" className="mt-4">
        {inFlight && isAch && status === "processing" && (
          <p className="rounded-md bg-info-bg p-4 text-info">Your bank payment is <strong>pending</strong>. ACH payments can take several business days to settle. We&apos;ll email you when it&apos;s confirmed; a final receipt is issued then.</p>
        )}
        {inFlight && !(isAch && status === "processing") && (
          <p className="rounded-md bg-info-bg p-4 text-info">We&apos;re waiting for confirmation from our payment provider. This page updates automatically. Do not submit the payment again.</p>
        )}
        {status === "failed" && <p className="rounded-md bg-danger-bg p-4 text-danger">No gift was recorded. You can <Link className="underline" href="/donate">try again</Link>.</p>}
        {status === "succeeded" && <p className="rounded-md bg-success-bg p-4 text-success">Your payment is confirmed.</p>}
      </div>

      {status !== "failed" && (
        <>
          <p className="mt-6 text-lg">{message}</p>
          <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-line py-6">
            <dt className="text-ink-soft">Amount</dt><dd className="font-semibold">{formatMoney(d.amount_cents, settings.currency)}</dd>
            <dt className="text-ink-soft">Frequency</dt><dd>{FREQ[d.frequency as keyof typeof FREQ]}</dd>
            <dt className="text-ink-soft">Designation</dt><dd>{project?.title ?? "General Fund"}</dd>
            <dt className="text-ink-soft">Status</dt><dd>{STATUS_LABELS[status]}</dd>
            {receipt && <><dt className="text-ink-soft">Receipt number</dt><dd>{receipt.receipt_number}</dd></>}
          </dl>
          <div className="mt-8 flex flex-wrap gap-4">
            {receipt && (
              <a className="min-h-12 rounded-md bg-brand-700 px-6 py-3 font-semibold text-white" href={`/receipts/${d.id}/pdf`}>
                {isReceiptFinal(status) ? "Download receipt" : "Download pending acknowledgment"}
              </a>
            )}
            <Link className="min-h-12 rounded-md border-2 border-teal-800 px-6 py-3 font-semibold text-teal-800" href="/dashboard">Go to your account</Link>
          </div>
        </>
      )}
    </div>
  );
}
