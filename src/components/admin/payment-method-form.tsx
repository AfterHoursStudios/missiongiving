"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { PlusCircle, X } from "lucide-react";
import { startPaymentMethodSetup } from "@/lib/admin/payment-method-actions";
import { cn } from "@/lib/utils";

type Kind = "card" | "bank";
const field = "min-h-11 w-full rounded-md border border-ink-soft/60 bg-white px-3";
const returnUrl = (donorId: string) => `${window.location.origin}/admin/donors/${donorId}?tab=accounts&pm_setup=1`;

/**
 * "+ Add payment method" on a donor's Accounts tab: a pop-up with Card and Bank tabs.
 * Card: Stripe's secure card fields. Bank: staff type the routing and account numbers the donor reads out; they go from
 * this browser straight to Stripe (never to our server), and Stripe verifies the account with two small deposits.
 * Neither uses Stripe Link or the bank-connection window, which remember a previous donor on a shared staff computer.
 */
export function PaymentMethodForm({ donorId, publishableKey }: { donorId: string; publishableKey: string | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>("card");
  const [cardSecret, setCardSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const stripePromise = useMemo(() => (publishableKey ? loadStripe(publishableKey) : null), [publishableKey]);
  const close = () => ref.current?.close();

  const prepareCard = () => {
    if (cardSecret) return;
    startTransition(async () => {
      const res = await startPaymentMethodSetup(donorId, "card");
      if (!res.ok) return setError(res.error);
      setCardSecret(res.clientSecret);
    });
  };
  const open = () => { setError(null); ref.current?.showModal(); if (kind === "card") prepareCard(); };
  const choose = (k: Kind) => { setKind(k); setError(null); if (k === "card") prepareCard(); };

  return (
    <>
      <button type="button" onClick={open}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-teal-800 px-5 font-bold text-teal-800 hover:bg-paper-2">
        <PlusCircle aria-hidden="true" size={18} />Add payment method
      </button>
      <dialog ref={ref} aria-labelledby={`pm-title-${donorId}`} onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50">
        <div className="relative p-5 sm:p-6">
          <button type="button" onClick={close} className="absolute right-4 top-3 inline-flex min-h-11 items-center gap-1 font-semibold text-teal-600 hover:underline">
            Close<X aria-hidden="true" size={18} />
          </button>
          <h2 id={`pm-title-${donorId}`} className="mt-6 text-2xl font-bold">Add payment method</h2>
          <p className="mt-1 text-sm text-ink-soft">Have the donor read you their details and enter them below. They go straight to Stripe; we never see or store the numbers.</p>

          <div role="tablist" aria-label="Payment method type" className="mt-4 grid grid-cols-2 gap-2">
            {(["card", "bank"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => choose(k)}
                className={cn("min-h-11 rounded-md border-2 px-3 font-semibold", kind === k ? "border-teal-800 bg-paper-2 text-teal-800" : "border-line hover:border-ink-soft")}>
                {k === "card" ? "Card" : "Bank account"}
              </button>
            ))}
          </div>

          <div className="mt-4" role="tabpanel">
            {error && <p role="alert" className="mb-3 rounded-md bg-danger-bg p-3 text-danger">{error}</p>}
            {!stripePromise && <p role="alert" className="rounded-md bg-danger-bg p-3 text-danger">Payments are not configured (no Stripe publishable key).</p>}
            {stripePromise && kind === "card" && (
              cardSecret
                ? <Elements stripe={stripePromise} options={{ clientSecret: cardSecret, appearance: { theme: "stripe" } }}><CardForm donorId={donorId} onCancel={close} /></Elements>
                : !error && <p role="status" className="text-ink-soft">{pending ? "Preparing secure form…" : ""}</p>
            )}
            {stripePromise && kind === "bank" && <BankForm donorId={donorId} stripePromise={stripePromise} onCancel={close} />}
          </div>
        </div>
      </dialog>
    </>
  );
}

function Buttons({ busy, label, onCancel, disabled }: { busy: boolean; label: string; onCancel: () => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      <button type="submit" disabled={busy || disabled} className="min-h-11 rounded-full bg-teal-800 px-6 font-bold text-white hover:bg-teal-800/90 disabled:opacity-60">{busy ? "Saving…" : label}</button>
      <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-full border-2 border-teal-800 px-6 font-bold text-teal-800 hover:bg-paper-2 disabled:opacity-60">Cancel</button>
    </div>
  );
}

function CardForm({ donorId, onCancel }: { donorId: string; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true); setError(null);
    const { error } = await elements.submit().then(() => stripe.confirmSetup({ elements, confirmParams: { return_url: returnUrl(donorId) } }));
    if (error) { setError(error.message ?? "Could not save the card."); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement options={{ layout: { type: "accordion", defaultCollapsed: false }, wallets: { applePay: "never", googlePay: "never", link: "never" } }}
        onLoadError={(e) => setError(`The secure card form couldn't load: ${e.error.message ?? "unknown error"}`)} />
      <div role="alert">{error && <p className="rounded-md bg-danger-bg p-3 text-danger">{error}</p>}</div>
      <Buttons busy={busy} label="Save card" onCancel={onCancel} disabled={!stripe} />
    </form>
  );
}

function BankForm({ donorId, stripePromise, onCancel }: { donorId: string; stripePromise: Promise<StripeJs | null>; onCancel: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    const name = String(f.get("holder") ?? "").trim(), routing = String(f.get("routing") ?? "").replace(/\D/g, ""), account = String(f.get("account") ?? "").replace(/\D/g, "");
    if (!name) return setError("Enter the account holder's name.");
    if (routing.length !== 9) return setError("The routing number is 9 digits.");
    if (account.length < 4 || account.length > 17) return setError("Check the account number.");
    if (account !== String(f.get("account2") ?? "").replace(/\D/g, "")) return setError("The account numbers don't match.");
    setBusy(true); setError(null);
    const res = await startPaymentMethodSetup(donorId, "bank");
    if (!res.ok) { setError(res.error); setBusy(false); return; }
    const stripe = await stripePromise;
    if (!stripe) { setError("Payments are not configured."); setBusy(false); return; }
    const { setupIntent, error } = await stripe.confirmUsBankAccountSetup(res.clientSecret, {
      payment_method: {
        us_bank_account: { routing_number: routing, account_number: account, account_holder_type: f.get("type") === "company" ? "company" : "individual" },
        billing_details: { name },
      },
    });
    if (error || !setupIntent) { setError(error?.message ?? "The bank account could not be saved."); setBusy(false); return; }
    // Back to the Accounts tab, which shows "waiting for verification" with the link for the donor.
    onCancel();
    router.push(`/admin/donors/${donorId}?tab=accounts&pm_setup=1&setup_intent=${setupIntent.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-3" autoComplete="off">
      <div><label htmlFor="bank-holder" className="block font-semibold">Account holder name</label><input id="bank-holder" name="holder" required className={field} /></div>
      <fieldset className="flex flex-wrap gap-x-5"><legend className="font-semibold">Account type</legend>
        <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" name="type" value="individual" defaultChecked className="size-4" />Personal</label>
        <label className="inline-flex min-h-11 items-center gap-2"><input type="radio" name="type" value="company" className="size-4" />Business</label>
      </fieldset>
      <div><label htmlFor="bank-routing" className="block font-semibold">Routing number</label><input id="bank-routing" name="routing" inputMode="numeric" maxLength={9} required className={field} /></div>
      <div><label htmlFor="bank-account" className="block font-semibold">Account number</label><input id="bank-account" name="account" inputMode="numeric" maxLength={17} required className={field} /></div>
      <div><label htmlFor="bank-account2" className="block font-semibold">Confirm account number</label><input id="bank-account2" name="account2" inputMode="numeric" maxLength={17} required className={field} /></div>
      <p className="text-sm text-ink-soft">Stripe sends two small deposits to this account (1–2 business days). Once the donor confirms the amounts, it can be charged.</p>
      <div role="alert">{error && <p className="rounded-md bg-danger-bg p-3 text-danger">{error}</p>}</div>
      <Buttons busy={busy} label="Save bank account" onCancel={onCancel} />
    </form>
  );
}
