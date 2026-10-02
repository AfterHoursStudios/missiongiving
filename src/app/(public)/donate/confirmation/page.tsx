import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { pickConfirmationMessage } from "@/lib/messages";
import { STATUS_LABELS, isReceiptFinal, type DonationStatus } from "@/lib/donations/status";
import { AutoRefresh } from "@/components/donate/auto-refresh";
import { reconcileDonation } from "@/lib/stripe/reconcile-donation";
import { designationLabel } from "@/lib/donations/designation";

export const metadata: Metadata = { title: "Thank you", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const FREQ = { one_time: "One time", monthly: "Monthly", yearly: "Yearly" } as const;

export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ donation?: string }> }) {
  const { donation: id } = await searchParams;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Confirm straight from Stripe rather than waiting for the webhook (this page auto-refreshes while in flight).
  await reconcileDonation(id);
  const user = await getUser();

  // Signed in: RLS guarantees a donor can only load their own donation. A guest has no session for RLS to check
  // against, so this donation's own unguessable id is what stands in for a link — the same id Stripe already
  // redirected them here with, and the same one their receipt email links to.
  const supabase = user ? await createSupabaseServerClient() : createSupabaseAdminClient();
  const { data: d } = await supabase.from("donations")
    .select("id, amount_cents, frequency, status, payment_method, tier_id, project_id, donor_id, donor_profiles(email, user_id), receipts(receipt_number, is_final)")
    .eq("id", id).maybeSingle();
  if (!d) notFound();
  const donorRow = Array.isArray(d.donor_profiles) ? d.donor_profiles[0] : d.donor_profiles;

  const [settings, { data: tier }, designation] = await Promise.all([
    getOrgSettings(),
    d.tier_id ? supabase.from("donation_tiers").select("confirmation_message").eq("id", d.tier_id).maybeSingle() : Promise.resolve({ data: null }),
    designationLabel(d.project_id),
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
            <dt className="text-ink-soft">Designation</dt><dd>{designation}</dd>
            <dt className="text-ink-soft">Status</dt><dd>{STATUS_LABELS[status]}</dd>
            {receipt && <><dt className="text-ink-soft">Receipt number</dt><dd>{receipt.receipt_number}</dd></>}
          </dl>
          <div className="mt-8 flex flex-wrap gap-4">
            {receipt && (
              <a className="min-h-12 rounded-md bg-brand-700 px-6 py-3 font-semibold text-white" href={`/receipts/${d.id}/pdf`}>
                {isReceiptFinal(status) ? "Download receipt" : "Download pending acknowledgment"}
              </a>
            )}
            {user && <Link className="min-h-12 rounded-md border-2 border-teal-800 px-6 py-3 font-semibold text-teal-800" href="/dashboard">Go to your account</Link>}
          </div>

          {!user && (
            <div className="mt-10 rounded-md bg-paper-2 p-6">
              {donorRow?.user_id ? (
                <>
                  <p className="text-lg font-semibold">This email already has an account.</p>
                  <p className="mt-1 text-ink-soft">Sign in to see this gift alongside your giving history and updates.</p>
                  <Link className="mt-4 inline-block min-h-12 rounded-md bg-brand-700 px-6 py-3 font-semibold text-white" href={`/sign-in?next=${encodeURIComponent(`/donate/confirmation?donation=${d.id}`)}`}>Sign in</Link>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">Want to see this gift again, plus updates on the work you supported?</p>
                  <p className="mt-1 text-ink-soft">Create a free account — it&apos;s optional, and your receipt has already been emailed to you either way.</p>
                  <Link className="mt-4 inline-block min-h-12 rounded-md bg-brand-700 px-6 py-3 font-semibold text-white"
                    href={`/register?email=${encodeURIComponent(donorRow?.email ?? "")}&next=${encodeURIComponent(`/donate/confirmation?donation=${d.id}`)}`}>
                    Create a free account
                  </Link>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
