import { CreditCard, Landmark } from "lucide-react";
import { getDonorContext } from "@/lib/donor/context";
import { finalizeDonorPaymentMethodSetup, removeDonorPaymentMethod, setDonorDefaultPaymentMethod } from "@/lib/donor/payment-methods";
import { listPaymentMethods } from "@/lib/admin/payment-on-file";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { publicEnv } from "@/lib/env";
import { DonorPaymentMethodForm } from "@/components/donor/payment-method-form";
import { ConfirmAction, InlineAction } from "@/components/admin/donor-record/client";
import { Empty, Panel } from "@/components/donor/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payment methods" };

/** How many of the donor's live recurring gifts charge each payment method (a gift's own method, else the customer default). */
async function recurringUse(customerId: string | null, defaultId: string | null): Promise<Map<string, number>> {
  const use = new Map<string, number>();
  if (!customerId || !isStripeConfigured()) return use;
  try {
    const subs = await getStripe().subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    for (const s of subs.data) {
      if (!["active", "past_due", "trialing", "unpaid", "incomplete"].includes(s.status)) continue;
      const pm = (typeof s.default_payment_method === "string" ? s.default_payment_method : s.default_payment_method?.id) ?? defaultId;
      if (pm) use.set(pm, (use.get(pm) ?? 0) + 1);
    }
  } catch { /* the list still shows; only the "used by" note is missing */ }
  return use;
}

export default async function PaymentMethodsPage({ searchParams }: { searchParams: Promise<{ setup_intent?: string }> }) {
  const sp = await searchParams;
  const { donor } = await getDonorContext();
  const setupResult = sp.setup_intent ? await finalizeDonorPaymentMethodSetup(sp.setup_intent) : null;
  const { methods, error } = await listPaymentMethods(donor?.stripe_customer_id ?? null);
  const use = await recurringUse(donor?.stripe_customer_id ?? null, methods.find((m) => m.isDefault)?.id ?? null);
  const liveGifts = [...use.values()].reduce((a, b) => a + b, 0);
  const publishableKey = publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Payment methods</h1>
        {donor && <DonorPaymentMethodForm publishableKey={publishableKey} />}
      </div>
      <p className="mt-1 max-w-prose text-ink-soft">Add a new card or bank account, choose which one your recurring gifts use, or remove ones you no longer need.</p>

      {setupResult && (setupResult.pendingVerification ? (
        <div role="alert" className="mt-4 rounded-md border border-info/30 bg-info-bg p-4 text-info">
          <p className="font-semibold">Bank account added. It needs a quick check before it can be used.</p>
          <p className="mt-1">Stripe is sending two small deposits to the account (1–2 business days). Enter the amounts to finish, then choose &ldquo;Use for my gifts&rdquo; on it.</p>
          {setupResult.pendingVerification.url && <p className="mt-2"><a className="font-semibold underline" href={setupResult.pendingVerification.url} target="_blank" rel="noopener">Enter the deposit amounts</a></p>}
        </div>
      ) : (
        <p role="alert" className={`mt-4 rounded-md p-3 ${setupResult.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
          {setupResult.ok ? "Payment method saved. Your recurring gifts will use it from now on." : setupResult.error}
        </p>
      ))}
      {error && <p className="mt-4 rounded-md bg-warning-bg p-3 text-warning">{error}</p>}

      <div className="mt-6">
        {!donor ? <Empty title="No payment methods yet">Your account is set up with your first gift.</Empty>
          : methods.length === 0 ? <Empty title="No saved payment methods">Cards and bank accounts you save, or use for a recurring gift, appear here.</Empty> : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {methods.map((m) => {
                const Icon = m.type === "us_bank_account" ? Landmark : CreditCard;
                const gifts = use.get(m.id) ?? 0;
                return (
                  <li key={m.id} className="flex flex-col rounded-lg border border-line bg-white p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-paper-2 text-teal-800"><Icon size={20} /></span>
                      <div className="min-w-0">
                        <p className="font-semibold">{m.type === "us_bank_account" ? m.label : `${m.label} card`}{m.last4 && <span className="tabular-nums"> •••• {m.last4}</span>}</p>
                        <p className="text-sm text-ink-soft">{m.expires ? `Expires ${m.expires}` : m.type === "us_bank_account" ? "Bank account (ACH)" : ""}</p>
                      </div>
                    </div>
                    <p className="mb-4 mt-3 text-sm">
                      {gifts > 0
                        ? <span className="inline-flex rounded-full bg-success-bg px-2.5 py-0.5 font-semibold text-success">Used for {gifts} recurring gift{gifts === 1 ? "" : "s"}</span>
                        : m.isDefault ? <span className="inline-flex rounded-full bg-paper-2 px-2.5 py-0.5 font-semibold">Default</span>
                          : <span className="text-ink-soft">Not used for recurring gifts</span>}
                    </p>
                    <div className="mt-auto flex flex-wrap items-start justify-between gap-x-4 border-t border-line pt-2">
                      {/* Hidden only when it's already the default and every recurring gift uses it. */}
                      {!(m.isDefault && gifts === liveGifts) && <InlineAction action={setDonorDefaultPaymentMethod} fields={{ pmId: m.id }} label="Use for my gifts" />}
                      <ConfirmAction action={removeDonorPaymentMethod} fields={{ pmId: m.id }} label="Remove"
                        confirmText={`Remove ${m.label}${m.last4 ? ` •••• ${m.last4}` : ""}?`} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </div>

      <Panel className="mt-6">
        <p className="text-sm text-ink-soft">Card and bank details are held securely by Stripe, our payment processor. We never see or store your full number; only the last four digits show here. Changing the method a recurring gift uses doesn&apos;t change its amount or schedule.</p>
      </Panel>
    </>
  );
}
