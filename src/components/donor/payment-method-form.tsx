"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { PlusCircle, X } from "lucide-react";
import { startDonorPaymentMethodSetup } from "@/lib/donor/payment-methods";

/**
 * "Add a payment method" on the donor's Payment methods page: a pop-up with Stripe's own secure fields for a card or a
 * bank account. The numbers go from the browser straight to Stripe; Stripe then sends the donor back to the page with
 * ?setup_intent=…, where the new method becomes the one their gifts use.
 */
export function DonorPaymentMethodForm({ publishableKey, returnPath = "/dashboard/payment-methods", label = "Add a payment method", variant = "primary" }: {
  publishableKey: string | null; returnPath?: string; label?: string; variant?: "primary" | "link";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const stripePromise = useMemo(() => (publishableKey ? loadStripe(publishableKey) : null), [publishableKey]);
  const close = () => ref.current?.close();

  const open = () => {
    setError(null);
    ref.current?.showModal();
    if (secret) return;
    startTransition(async () => {
      const res = await startDonorPaymentMethodSetup();
      if (!res.ok) return setError(res.error);
      setSecret(res.clientSecret);
    });
  };

  return (
    <>
      <button type="button" onClick={open}
        className={variant === "link"
          ? "inline-flex min-h-11 items-center gap-1.5 font-semibold text-teal-600 hover:underline"
          : "inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800"}>
        <PlusCircle aria-hidden="true" size={18} />{label}
      </button>
      <dialog ref={ref} aria-labelledby="pm-title" onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50">
        <div className="relative p-5 sm:p-6">
          <button type="button" onClick={close} className="absolute right-4 top-3 inline-flex min-h-11 items-center gap-1 font-semibold text-teal-600 hover:underline">
            Close<X aria-hidden="true" size={18} />
          </button>
          <h2 id="pm-title" className="mt-6 text-2xl font-bold">Add a payment method</h2>
          <p className="mt-1 text-sm text-ink-soft">Your details go straight to Stripe, our payment processor. We never see or store your full card or account number.</p>
          <div className="mt-4">
            {error && <p role="alert" className="mb-3 rounded-md bg-danger-bg p-3 text-danger">{error}</p>}
            {!stripePromise && <p role="alert" className="rounded-md bg-danger-bg p-3 text-danger">Payments are not available right now.</p>}
            {stripePromise && (secret
              ? <Elements stripe={stripePromise} options={{ clientSecret: secret, appearance: { theme: "stripe" } }}><SetupForm onCancel={close} returnPath={returnPath} /></Elements>
              : !error && <p role="status" className="text-ink-soft">{pending ? "Preparing secure form…" : ""}</p>)}
          </div>
        </div>
      </dialog>
    </>
  );
}

function SetupForm({ onCancel, returnPath }: { onCancel: () => void; returnPath: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return;
    setBusy(true); setError(null);
    const { error: invalid } = await elements.submit();
    if (invalid) { setError(invalid.message ?? "Check your details."); setBusy(false); return; }
    // On success Stripe redirects back to the page, which finishes the setup.
    const { error } = await stripe.confirmSetup({ elements, confirmParams: { return_url: `${window.location.origin}${returnPath}` } });
    if (error) { setError(error.message ?? "We could not save that payment method."); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <PaymentElement options={{ layout: { type: "tabs" }, wallets: { applePay: "never", googlePay: "never", link: "never" } }}
        onLoadError={(e) => setError(`The secure form couldn't load: ${e.error.message ?? "unknown error"}`)} />
      <div role="alert">{error && <p className="rounded-md bg-danger-bg p-3 text-danger">{error}</p>}</div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy || !stripe} className="min-h-11 rounded-md bg-brand-700 px-6 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-md border-2 border-teal-800 px-6 font-semibold text-teal-800 hover:bg-paper-2 disabled:opacity-60">Cancel</button>
      </div>
    </form>
  );
}
