"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { CreditCard, Landmark } from "lucide-react";
import { startCheckout } from "@/lib/donations/actions";
import type { SavedPaymentMethod } from "@/lib/admin/payment-on-file";
import type { FlowProject, FlowTier } from "@/components/donate/donate-flow";
import { DonorPaymentMethodForm } from "./payment-method-form";
import { ProgressBar } from "./ui";
import { dollarsToCents, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type Frequency = "one_time" | "monthly" | "yearly";
export interface GiveWoman { id: string; name: string; country: string | null; monthlyCents: number; remainingCents: number }
export interface GiveSetup {
  tiers: FlowTier[]; projects: FlowProject[];
  /** Set only when the donor came from the Sponsor a Woman page: the gift sponsors her, and she can't be changed here. */
  woman: GiveWoman | null;
  customEnabled: boolean; minCents: number; maxCents: number; publishableKey: string | null;
  donor: { firstName: string; lastName: string; email: string };
  methods: SavedPaymentMethod[];
}
/** "general" or "project:<id>". Sponsorships are chosen on the Sponsor a Woman page, never in this list. */
type Dest = string;

const FREQ: { id: Frequency; label: string }[] = [{ id: "one_time", label: "One time" }, { id: "monthly", label: "Monthly" }, { id: "yearly", label: "Yearly" }];
const pill = (active: boolean) => cn("min-h-11 rounded-md border-2 px-4 font-semibold transition-colors",
  active ? "border-brand-700 bg-brand-50 text-brand-800" : "border-line bg-white hover:border-ink-soft");
const panel = "rounded-lg border border-line bg-white p-4 shadow-sm sm:p-5";
const toCents = (v: string) => { try { return v.trim() ? dollarsToCents(v) : null; } catch { return null; } };

/**
 * The account-area Give page: a signed-in donor gives to the General Fund or a project, or (arriving from the Sponsor a
 * Woman page) sponsors the woman they chose there, using a card or bank account already saved on their account. The server decides the amount and checks the saved method is
 * theirs (startCheckout); the donor then confirms it here, so a bank's 3-D Secure check can still be shown.
 */
export function GiveForm({ setup, initial }: {
  setup: GiveSetup; initial: { dest: Dest; frequency: Frequency; paymentMethodId: string | null };
}) {
  const router = useRouter();
  const [dest, setDest] = useState<Dest>(initial.dest);
  const [frequency, setFrequency] = useState<Frequency>(initial.frequency);
  const [tierId, setTierId] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [pmId, setPmId] = useState<string | null>(initial.paymentMethodId ?? setup.methods.find((m) => m.isDefault)?.id ?? setup.methods[0]?.id ?? null);
  const [anonymous, setAnonymous] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());
  const stripePromise = useMemo(() => (setup.publishableKey ? loadStripe(setup.publishableKey) : null), [setup.publishableKey]);

  const woman = setup.woman;
  const [kind, id] = dest.split(":") as ["general" | "project", string | undefined];
  const project = !woman && kind === "project" ? setup.projects.find((p) => p.id === id) ?? null : null;
  const freq: Frequency = woman && frequency === "yearly" ? "monthly" : frequency;

  // Levels on offer for this destination and frequency (same rules the server applies in resolveAmount).
  const tiers = woman ? [] : setup.tiers.filter((t) =>
    ({ one_time: t.allow_one_time, monthly: t.allow_monthly, yearly: t.allow_yearly })[freq] &&
    (!project ? t.general_fund && t.project_id === null : t.project_id === null || t.project_id === project?.id));
  const customAllowed = !woman && setup.customEnabled && (project?.allow_custom_amount ?? true);
  const selectedTier = tiers.find((t) => t.id === tierId) ?? null;
  const customCents = toCents(custom);
  const amountCents = woman
    ? (freq === "monthly" ? customCents ?? woman.remainingCents : woman.monthlyCents)
    : selectedTier?.amount_cents ?? (customAllowed ? customCents : null);
  const method = setup.methods.find((m) => m.id === pmId) ?? null;
  const destLabel = woman ? `sponsor ${woman.name}` : project?.title ?? "the General Fund";

  const changeDest = (d: Dest) => { setDest(d); setTierId(null); setCustom(""); setError(null); };
  const giveHere = woman ? `/dashboard/give?sponsor=${woman.id}&frequency=${freq}` : `/dashboard/give?to=${encodeURIComponent(dest)}&frequency=${freq}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (custom.trim() && customCents === null) return setError("Enter the amount as a number, like 25 or 25.50.");
    if (!amountCents) return setError("Choose or enter an amount.");
    if (!method) return setError("Choose a payment method.");
    if (!stripePromise) return setError("Payments are not available right now.");
    setBusy(true); setError(null);
    const res = await startCheckout({
      idempotencyKey: key.current,
      destination: woman ? { kind: "sponsorship", sponsorshipId: woman.id } : project ? { kind: "project", projectId: project.id } : { kind: "general" },
      frequency: freq,
      tierId: woman ? null : selectedTier?.id ?? null,
      customAmountCents: woman ? (freq === "monthly" ? customCents : null) : selectedTier ? null : customCents,
      donor: { firstName: setup.donor.firstName, lastName: setup.donor.lastName, email: setup.donor.email },
      anonymous, marketingOptIn: true, projectUpdatesOptIn: true, dedication: null, note: note.trim() || undefined,
      paymentMethodId: method.id, fromAccount: true,
    });
    if (!res.ok) { key.current = crypto.randomUUID(); setBusy(false); return setError(res.error); }
    const stripe = await stripePromise;
    const done = `/dashboard/give?donation=${res.donationId}`;
    // Cards: any 3-D Secure check opens in a pop-up here. Bank accounts: records the donor's debit authorization.
    const { error: payError } = method.type === "us_bank_account"
      ? await stripe!.confirmUsBankAccountPayment(res.clientSecret, { payment_method: method.id })
      : await stripe!.confirmCardPayment(res.clientSecret, { payment_method: method.id });
    // A fresh key either way: a retry after a decline is a new attempt, never "already submitted".
    key.current = crypto.randomUUID();
    if (payError) { setBusy(false); return setError(`${payError.message ?? "The payment did not go through."} You have not been charged.`); }
    router.push(done);
  }

  return (
    <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-6">
        {woman ? (
          <section className={panel} aria-labelledby="g-dest">
            <h2 id="g-dest" className="text-xl font-bold">You&apos;re sponsoring {woman.name}</h2>
            {woman.country && <p className="text-ink-soft">{woman.country}</p>}
            <div className="mt-4 max-w-sm">
              <ProgressBar label="Her sponsorship" fundedCents={woman.monthlyCents - woman.remainingCents + (freq === "monthly" ? amountCents ?? 0 : 0)} totalCents={woman.monthlyCents}
                hint={`${formatMoney(woman.monthlyCents)} per month in full`} />
            </div>
            <p className="mt-3 text-sm"><Link className="font-semibold text-teal-600 hover:underline" href="/sponsor">Choose a different woman</Link></p>
          </section>
        ) : (
          <section className={panel} aria-labelledby="g-dest">
            <h2 id="g-dest" className="text-xl font-bold">Where should your gift go?</h2>
            <label htmlFor="g-to" className="sr-only">Give to</label>
            <select id="g-to" value={dest} onChange={(e) => changeDest(e.target.value)} className="mt-3 min-h-12 w-full rounded-md border border-ink-soft bg-white px-3">
              <option value="general">General Fund (where it&apos;s needed most)</option>
              {setup.projects.length > 0 && <optgroup label="Projects">{setup.projects.map((p) => <option key={p.id} value={`project:${p.id}`}>{p.title}</option>)}</optgroup>}
            </select>
            <p className="mt-3 text-sm text-ink-soft">To sponsor a woman, choose her on the <Link className="font-semibold text-teal-600 hover:underline" href="/sponsor">Sponsor a Woman</Link> page.</p>
          </section>
        )}

        <section className={panel} aria-labelledby="g-freq">
          <h2 id="g-freq" className="text-xl font-bold">How often?</h2>
          <div role="radiogroup" aria-labelledby="g-freq" className="mt-3 flex flex-wrap gap-2">
            {FREQ.filter((f) => !(woman && f.id === "yearly")).map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={freq === f.id} onClick={() => { setFrequency(f.id); setTierId(null); }} className={pill(freq === f.id)}>{f.label}</button>
            ))}
          </div>
          {woman && <p className="mt-2 text-sm text-ink-soft">Sponsorships are given monthly or as a single gift.</p>}
        </section>

        <section className={panel} aria-labelledby="g-amount">
          <h2 id="g-amount" className="text-xl font-bold">Amount</h2>
          {woman ? (freq === "monthly" ? (
            <div className="mt-3 max-w-xs">
              <label htmlFor="g-custom" className="block text-sm font-semibold">Monthly amount (up to {formatMoney(woman.remainingCents)})</label>
              <input id="g-custom" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={(woman.remainingCents / 100).toFixed(2)}
                className="mt-1 min-h-12 w-full rounded-md border border-ink-soft bg-white px-3" />
              <p className="mt-1 text-sm text-ink-soft">Leave blank to give the full {formatMoney(woman.remainingCents)}. Choose less to share her sponsorship.</p>
            </div>
          ) : <p className="mt-3 text-lg"><strong>{formatMoney(woman.monthlyCents)}</strong> as a single gift.</p>) : (
            <>
              {tiers.length > 0 && (
                <div role="radiogroup" aria-labelledby="g-amount" className="mt-3 flex flex-wrap gap-2">
                  {tiers.map((t) => (
                    <button key={t.id} type="button" role="radio" aria-checked={tierId === t.id} onClick={() => { setTierId(t.id); setCustom(""); }} className={pill(tierId === t.id)}>
                      {formatMoney(t.amount_cents)}<span className="sr-only">, {t.public_title}</span>
                    </button>
                  ))}
                </div>
              )}
              {customAllowed && (
                <div className="mt-3 max-w-xs">
                  <label htmlFor="g-custom" className="block text-sm font-semibold">{tiers.length ? "Or enter an amount" : "Enter an amount"}</label>
                  <input id="g-custom" inputMode="decimal" value={custom} onChange={(e) => { setCustom(e.target.value); setTierId(null); }} placeholder="0.00"
                    className="mt-1 min-h-12 w-full rounded-md border border-ink-soft bg-white px-3" />
                  <p className="mt-1 text-sm text-ink-soft">Between {formatMoney(setup.minCents)} and {formatMoney(setup.maxCents)}.</p>
                </div>
              )}
              {tiers.length === 0 && !customAllowed && <p className="mt-3 text-ink-soft">No amounts are offered for this choice right now. Try another frequency or destination.</p>}
            </>
          )}
        </section>

        <section className={panel} aria-labelledby="g-more">
          <h2 id="g-more" className="text-xl font-bold">A note with your gift <span className="text-base font-normal text-ink-soft">(optional)</span></h2>
          <label htmlFor="g-note" className="sr-only">Note</label>
          <textarea id="g-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className="mt-3 w-full rounded-md border border-ink-soft bg-white p-3" />
          <label className="mt-2 inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="size-4" />Keep this gift anonymous</label>
        </section>
      </div>

      <div className="space-y-6 lg:sticky lg:top-4">
        <section className={panel} aria-labelledby="g-pay">
          <h2 id="g-pay" className="text-xl font-bold">Pay with</h2>
          {setup.methods.length === 0 ? <p className="mt-2 text-ink-soft">You don&apos;t have a saved card or bank account yet.</p> : (
            <div role="radiogroup" aria-labelledby="g-pay" className="mt-3 space-y-2">
              {setup.methods.map((m) => {
                const Icon = m.type === "us_bank_account" ? Landmark : CreditCard;
                return (
                  <button key={m.id} type="button" role="radio" aria-checked={pmId === m.id} onClick={() => setPmId(m.id)}
                    className={cn("flex min-h-14 w-full items-center gap-3 rounded-md border-2 px-3 text-left", pmId === m.id ? "border-brand-700 bg-brand-50" : "border-line bg-white hover:border-ink-soft")}>
                    <Icon aria-hidden="true" size={20} className="shrink-0 text-teal-800" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{m.type === "us_bank_account" ? m.label : `${m.label} card`}{m.last4 && <span className="tabular-nums"> •••• {m.last4}</span>}</span>
                      {m.expires && <span className="block text-sm text-ink-soft">Expires {m.expires}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-2">
            <DonorPaymentMethodForm publishableKey={setup.publishableKey} returnPath={giveHere} label="Use a new card or bank account" variant="link" />
          </div>
        </section>

        <section className={panel} aria-labelledby="g-summary">
          <h2 id="g-summary" className="sr-only">Summary</h2>
          <p className="text-lg">
            {amountCents ? <><strong>{formatMoney(amountCents)}</strong> {FREQ.find((f) => f.id === freq)!.label.toLowerCase()}</> : "Choose an amount"} to {destLabel}
          </p>
          {freq !== "one_time" && <p className="mt-1 text-sm text-ink-soft">Charged today, then every {freq === "monthly" ? "month" : "year"}. Change or cancel any time under Recurring gifts.</p>}
          {method?.type === "us_bank_account" && <p className="mt-1 text-sm text-ink-soft">Bank payments take a few business days to clear.</p>}
          <div role="alert">{error && <p className="mt-3 rounded-md bg-danger-bg p-3 text-danger">{error}</p>}</div>
          <button type="submit" disabled={busy || !amountCents || !method}
            className="mt-4 min-h-12 w-full rounded-md bg-brand-700 px-6 font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? "Processing…" : amountCents ? `Give ${formatMoney(amountCents)}${freq === "one_time" ? "" : freq === "monthly" ? " monthly" : " yearly"}` : "Give"}
          </button>
        </section>
      </div>
    </form>
  );
}
