"use client";

import { useState, useTransition } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { startAdminCharge } from "@/lib/admin/virtual-terminal";
import { PayForm } from "@/components/donate/donate-flow";

const inputCls = "mt-1.5 min-h-11 w-full rounded-md border border-ink-soft bg-white px-3";

export interface TerminalDonor { id: string; firstName: string; lastName: string; email: string }
/** A saved card/bank account on the donor's Stripe customer (last 4 and expiry only). */
export interface TerminalSavedMethod { id: string; type: "card" | "us_bank_account" | "link"; label: string; last4: string; expires: string | null; isDefault: boolean }

const NEW = "new";
const methodName = (m: TerminalSavedMethod) => (m.type === "link" ? m.label : `${m.type === "card" ? m.label : `Bank account (${m.label})`} •••• ${m.last4}`);

export function VirtualTerminalForm({ projects, publishableKey, donor, savedMethods = [], oneTimeOnly = false }: {
  projects: { id: string; title: string }[]; publishableKey: string | null; donor?: TerminalDonor; savedMethods?: TerminalSavedMethod[];
  /** Gifts → One-time gift: the frequency is fixed to one time and the Frequency choice is hidden. */
  oneTimeOnly?: boolean;
}) {
  const [d, setD] = useState({ email: "", firstName: "", lastName: "", phone: "", amount: "", frequency: "one_time" as "one_time" | "monthly" | "yearly", projectId: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [session, setSession] = useState<{ clientSecret: string; donationId: string } | null>(null);
  const [method, setMethod] = useState<string>(donor ? (savedMethods.find((m) => m.isDefault) ?? savedMethods[0])?.id ?? NEW : NEW);
  const [done, setDone] = useState<{ status: "succeeded" | "processing"; method: string; amount: string } | null>(null);
  const chosen = savedMethods.find((m) => m.id === method) ?? null;
  const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

  if (done && donor) {
    return (
      <div role="status" className="max-w-md rounded-md bg-success-bg p-4 text-success">
        <p className="font-semibold">{done.status === "succeeded" ? `Charged $${done.amount} to ${done.method}.` : `Payment of $${done.amount} started on ${done.method}.`}</p>
        <p className="mt-1 text-ink">{done.status === "succeeded"
          ? "The gift is recorded and the receipt is emailed automatically."
          : "Bank payments take a few business days to clear. The gift is recorded once it settles."}</p>
        <p className="mt-3"><a className="font-semibold text-teal-600 underline" href={`/admin/donors/${donor.id}?tab=gifts`}>Back to {donor.firstName}&apos;s gifts</a></p>
      </div>
    );
  }

  if (session && stripePromise) {
    return (
      <div className="max-w-md">
        <p className="mb-4 text-ink-soft">Have the donor read you their card or bank account details, and enter them below. This screen — not our server — is where Stripe reads the numbers; we never see or store them.</p>
        <Elements stripe={stripePromise} options={{ clientSecret: session.clientSecret, appearance: { theme: "stripe" } }}>
          <PayForm donationId={session.donationId} submitLabel="Charge and record gift" staff />
        </Elements>
      </div>
    );
  }

  function submit() {
    setError(null);
    if (!donor && (!d.email.trim() || !d.firstName.trim() || !d.lastName.trim())) return setError("Enter the donor's name and email.");
    if (!d.amount.trim() || Number.isNaN(Number(d.amount))) return setError("Enter a valid amount.");
    startTransition(async () => {
      // From a donor's page the donor is already known: send their id, not the (hidden, empty) contact fields.
      const gift = { amount: d.amount, frequency: d.frequency, note: d.note, projectId: d.projectId || undefined };
      const res = await startAdminCharge(donor
        ? { ...gift, donorId: donor.id, paymentMethodId: chosen?.id }
        : { ...gift, email: d.email, firstName: d.firstName, lastName: d.lastName, phone: d.phone });
      if (!res.ok) return setError(res.error);
      if ("charged" in res) return setDone({ status: res.charged, method: chosen ? methodName(chosen) : "", amount: Number(d.amount).toFixed(2) });
      setSession({ clientSecret: res.clientSecret, donationId: res.donationId });
    });
  }

  return (
    <div className="max-w-md space-y-4">
      <div role="alert" aria-live="assertive">{error && <p className="rounded-md bg-danger-bg p-3 text-danger">{error}</p>}</div>
      {donor ? (
        <div className="rounded-md bg-paper-2 p-3">
          <p className="font-semibold">{donor.firstName} {donor.lastName}</p>
          <p className="text-sm text-ink-soft">{donor.email || <span className="italic">No email on file — no receipt will be emailed</span>}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block font-semibold">First name</label><input className={inputCls} value={d.firstName} onChange={(e) => setD({ ...d, firstName: e.target.value })} /></div>
            <div><label className="block font-semibold">Last name</label><input className={inputCls} value={d.lastName} onChange={(e) => setD({ ...d, lastName: e.target.value })} /></div>
          </div>
          <div><label className="block font-semibold">Email</label><input type="email" className={inputCls} value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></div>
          <div><label className="block font-semibold">Phone (optional)</label><input className={inputCls} value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></div>
        </>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="block font-semibold">Amount (USD)</label><input inputMode="decimal" className={inputCls} value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} /></div>
        {oneTimeOnly ? (
          <div><span className="block font-semibold">Frequency</span><p className="mt-1.5 flex min-h-11 items-center">One time</p></div>
        ) : (
          <div><label className="block font-semibold">Frequency</label>
            <select className={inputCls} value={d.frequency} onChange={(e) => setD({ ...d, frequency: e.target.value as typeof d.frequency })}>
              <option value="one_time">One time</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
            </select>
          </div>
        )}
      </div>
      <div><label className="block font-semibold">Designation</label>
        <select className={inputCls} value={d.projectId} onChange={(e) => setD({ ...d, projectId: e.target.value })}>
          <option value="">General Fund</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </div>
      {donor && savedMethods.length > 0 && (
        <fieldset>
          <legend className="font-semibold">Payment method</legend>
          <div className="mt-1.5 space-y-1">
            {[...savedMethods.map((m) => ({ id: m.id, title: methodName(m), hint: [m.expires && `exp ${m.expires}`, m.isDefault && "default"].filter(Boolean).join(" · ") })),
              { id: NEW, title: "Enter a new card or bank account", hint: "" }].map((o) => (
              <label key={o.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 ${method === o.id ? "border-teal-800 bg-paper-2" : "border-line"}`}>
                <input type="radio" name="payment-method" value={o.id} checked={method === o.id} onChange={() => setMethod(o.id)} className="size-4" />
                <span className="flex-1">{o.title}</span>
                {o.hint && <span className="text-sm text-ink-soft">{o.hint}</span>}
              </label>
            ))}
          </div>
          {chosen && <p className="mt-1.5 text-sm text-ink-soft">Only charge a saved card with the donor&apos;s permission for this gift.</p>}
        </fieldset>
      )}
      <div><label className="block font-semibold">Note (optional)</label><textarea rows={2} className={inputCls} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} /></div>
      <button type="button" onClick={submit} disabled={pending} className="min-h-12 rounded-md bg-brand-700 px-6 font-semibold text-white disabled:opacity-60">
        {pending ? (chosen ? "Charging…" : "Preparing…") : chosen ? `Charge${d.amount && !Number.isNaN(Number(d.amount)) ? ` $${Number(d.amount).toFixed(2)}` : ""} to ${methodName(chosen)}` : "Continue to payment"}
      </button>
    </div>
  );
}
