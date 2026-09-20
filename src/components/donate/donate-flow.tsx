"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { startCheckout } from "@/lib/donations/actions";
import { formatMoney, dollarsToCents } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface FlowTier {
  id: string; public_title: string; amount_cents: number; short_description: string | null; featured: boolean;
  allow_one_time: boolean; allow_monthly: boolean; allow_yearly: boolean; general_fund: boolean; project_id: string | null;
}
export interface FlowProject { id: string; title: string; allow_custom_amount: boolean }
export interface FlowConfig {
  tiers: FlowTier[]; projects: FlowProject[]; customEnabled: boolean; minCents: number; maxCents: number;
  publishableKey: string | null; defaults: { firstName: string; lastName: string };
  initialFrequency: Frequency; initialProjectId: string | null;
}
type Frequency = "one_time" | "monthly" | "yearly";

const STEPS = ["Destination", "Frequency", "Amount", "Your details", "Payment"] as const;
const FREQ: { id: Frequency; label: string }[] = [
  { id: "one_time", label: "One time" }, { id: "monthly", label: "Monthly" }, { id: "yearly", label: "Yearly" },
];

const choice = (active: boolean) =>
  cn("min-h-14 rounded-md border-2 px-4 py-3 text-left font-semibold transition-colors",
    active ? "border-brand-700 bg-brand-50" : "border-line bg-white hover:border-ink-soft");

export function DonateFlow({ config }: { config: FlowConfig }) {
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(config.initialProjectId);
  const [frequency, setFrequency] = useState<Frequency>(config.initialFrequency);
  const [tierId, setTierId] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [d, setD] = useState({
    firstName: config.defaults.firstName, lastName: config.defaults.lastName, phone: "", anonymous: false,
    marketing: false, projectUpdates: false, dedicationKind: "" as "" | "in_honor_of" | "in_memory_of", dedicationName: "", note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [session, setSession] = useState<{ clientSecret: string; returnUrl: string } | null>(null);
  const key = useRef(crypto.randomUUID());

  const project = config.projects.find((p) => p.id === projectId) ?? null;
  const tiers = useMemo(
    () => config.tiers.filter((t) =>
      ({ one_time: t.allow_one_time, monthly: t.allow_monthly, yearly: t.allow_yearly })[frequency] &&
      (projectId ? t.project_id === null || t.project_id === projectId : t.general_fund && t.project_id === null)),
    [config.tiers, frequency, projectId],
  );
  const customAllowed = config.customEnabled && (project?.allow_custom_amount ?? true);
  const selected = tiers.find((t) => t.id === tierId) ?? null;
  const customCents = (() => { try { return custom ? dollarsToCents(custom) : null; } catch { return null; } })();
  const amountCents = selected?.amount_cents ?? customCents;

  function next() {
    setError(null);
    if (step === 2) {
      if (!amountCents) return setError("Choose an amount to continue.");
      if (!selected && (amountCents < config.minCents || amountCents > config.maxCents))
        return setError(`Enter an amount between ${formatMoney(config.minCents)} and ${formatMoney(config.maxCents)}.`);
    }
    if (step === 3) {
      if (!d.firstName.trim() || !d.lastName.trim()) return setError("Please enter your first and last name.");
      if (d.dedicationKind && !d.dedicationName.trim()) return setError("Enter the name for your dedication, or remove it.");
      return startTransition(async () => {
        const res = await startCheckout({
          idempotencyKey: key.current,
          destination: projectId ? { kind: "project", projectId } : { kind: "general" },
          frequency, tierId: selected?.id ?? null, customAmountCents: selected ? null : customCents,
          donor: { firstName: d.firstName, lastName: d.lastName, phone: d.phone },
          anonymous: d.anonymous, marketingOptIn: d.marketing, projectUpdatesOptIn: d.projectUpdates,
          dedication: d.dedicationKind ? { kind: d.dedicationKind, name: d.dedicationName } : null,
          note: d.note || undefined,
        });
        if (!res.ok) { key.current = crypto.randomUUID(); return setError(res.error); }
        setSession({ clientSecret: res.clientSecret, returnUrl: res.returnUrl });
        setStep(4);
      });
    }
    setStep((s) => s + 1);
  }

  const stripePromise = useMemo(() => (config.publishableKey ? loadStripe(config.publishableKey) : null), [config.publishableKey]);
  const locked = step === 4;

  return (
    <div className="mx-auto max-w-2xl">
      <ol className="mb-8 flex gap-2 text-sm" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}
            className={cn("flex-1 border-t-4 pt-2", i <= step ? "border-brand-700 font-semibold" : "border-line text-ink-soft")}>
            <span className="sr-only">Step {i + 1}: </span><span className="hidden sm:inline">{s}</span><span className="sm:hidden">{i + 1}</span>
          </li>
        ))}
      </ol>

      <div role="alert" aria-live="assertive">
        {error && <p className="mb-4 rounded-md bg-danger-bg p-3 text-danger">{error}</p>}
      </div>

      {step === 0 && (
        <fieldset className="space-y-3">
          <legend className="mb-3 font-display text-2xl font-semibold">Where should your gift go?</legend>
          <button type="button" className={choice(projectId === null) + " w-full"} aria-pressed={projectId === null}
            onClick={() => { setProjectId(null); setTierId(null); }}>General Fund <span className="block font-normal text-ink-soft">Used where it is needed most</span></button>
          {config.projects.map((p) => (
            <button key={p.id} type="button" className={choice(projectId === p.id) + " w-full"} aria-pressed={projectId === p.id}
              onClick={() => { setProjectId(p.id); setTierId(null); }}>{p.title}</button>
          ))}
        </fieldset>
      )}

      {step === 1 && (
        <fieldset>
          <legend className="mb-3 font-display text-2xl font-semibold">How often would you like to give?</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {FREQ.map((f) => (
              <button key={f.id} type="button" className={choice(frequency === f.id)} aria-pressed={frequency === f.id}
                onClick={() => { setFrequency(f.id); setTierId(null); }}>{f.label}</button>
            ))}
          </div>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset>
          <legend className="mb-3 font-display text-2xl font-semibold">Choose an amount</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {tiers.map((t) => (
              <button key={t.id} type="button" className={choice(tierId === t.id)} aria-pressed={tierId === t.id}
                onClick={() => { setTierId(t.id); setCustom(""); }}>
                <span className="text-xl">{formatMoney(t.amount_cents)}</span>
                {t.featured && <span className="ml-2 rounded bg-teal-800 px-2 py-0.5 text-xs font-semibold text-white">Recommended</span>}
                {t.short_description && <span className="block text-sm font-normal text-ink-soft">{t.short_description}</span>}
              </button>
            ))}
          </div>
          {tiers.length === 0 && !customAllowed && <p className="text-ink-soft">No amounts are available for this selection.</p>}
          {customAllowed && (
            <div className="mt-5">
              <label htmlFor="custom" className="block font-semibold">Or enter another amount (USD)</label>
              <input id="custom" inputMode="decimal" value={custom} placeholder="0.00"
                onChange={(e) => { setCustom(e.target.value); setTierId(null); }}
                className="mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-3" />
              <p className="mt-1 text-sm text-ink-soft">Minimum {formatMoney(config.minCents)}, maximum {formatMoney(config.maxCents)}.</p>
            </div>
          )}
        </fieldset>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl font-semibold">Your details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Text label="First name" value={d.firstName} auto="given-name" onChange={(v) => setD({ ...d, firstName: v })} />
            <Text label="Last name" value={d.lastName} auto="family-name" onChange={(v) => setD({ ...d, lastName: v })} />
          </div>
          <Text label="Phone (optional)" value={d.phone} auto="tel" required={false} onChange={(v) => setD({ ...d, phone: v })} />
          <Check label="Do not show my name publicly (give anonymously)" checked={d.anonymous} onChange={(v) => setD({ ...d, anonymous: v })} />
          <Check label="Email me news and appreciation from Ultimate Mission" checked={d.marketing} onChange={(v) => setD({ ...d, marketing: v })} />
          <Check label="Email me updates on projects I support" checked={d.projectUpdates} onChange={(v) => setD({ ...d, projectUpdates: v })} />
          <p className="text-sm text-ink-soft">Your receipt is always emailed to you, whatever you choose above.</p>
          <div>
            <label htmlFor="ded" className="block font-semibold">Dedicate this gift (optional)</label>
            <select id="ded" value={d.dedicationKind} onChange={(e) => setD({ ...d, dedicationKind: e.target.value as typeof d.dedicationKind })}
              className="mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-3">
              <option value="">No dedication</option><option value="in_honor_of">In honor of</option><option value="in_memory_of">In memory of</option>
            </select>
            {d.dedicationKind && <div className="mt-3"><Text label="Name" value={d.dedicationName} onChange={(v) => setD({ ...d, dedicationName: v })} /></div>}
          </div>
          <div>
            <label htmlFor="note" className="block font-semibold">Note to Ultimate Mission (optional)</label>
            <textarea id="note" rows={3} maxLength={1000} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })}
              className="mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2" />
          </div>
        </div>
      )}

      {step === 4 && session && stripePromise && (
        <div>
          <h2 className="font-display text-2xl font-semibold">Payment</h2>
          <p className="mt-2">
            {formatMoney(amountCents ?? 0)} {FREQ.find((f) => f.id === frequency)?.label.toLowerCase()} to {project?.title ?? "the General Fund"}
          </p>
          <Elements stripe={stripePromise} options={{ clientSecret: session.clientSecret, appearance: { theme: "stripe" } }}>
            <PayForm returnUrl={session.returnUrl} />
          </Elements>
        </div>
      )}
      {step === 4 && !stripePromise && <p className="rounded-md bg-warning-bg p-3 text-warning">Payments are not configured (missing publishable key).</p>}

      {!locked && (
        <div className="mt-8 flex justify-between gap-3">
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}
            className="min-h-12 rounded-md border-2 border-teal-800 px-6 font-semibold text-teal-800 disabled:invisible">Back</button>
          <button type="button" onClick={next} disabled={pending}
            className="min-h-12 rounded-md bg-brand-700 px-8 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
            {pending ? "Preparing secure payment…" : step === 3 ? "Continue to payment" : "Continue"}
          </button>
        </div>
      )}
    </div>
  );
}

function PayForm({ returnUrl }: { returnUrl: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [method, setMethod] = useState<string>("card");
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAch = method === "us_bank_account";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || busy) return; // blocks double clicks
    if (isAch && !authorized) return setError("Please confirm the bank payment authorization.");
    setBusy(true); setError(null);
    // The result is only shown to the donor; payment status is set by Stripe webhooks, never by this redirect.
    const { error } = await elements.submit().then(() => stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl } }));
    if (error) { setError(error.message ?? "Payment could not be completed."); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <PaymentElement onChange={(ev) => setMethod(ev.value.type)} />
      {isAch && (
        <div className="rounded-md bg-info-bg p-4 text-sm">
          <p className="font-semibold">Bank (ACH) payments</p>
          <p className="mt-1">ACH payments can stay <strong>pending for several business days</strong> before they settle. Your gift is not final, and no final receipt is issued, until the bank confirms it.</p>
          <label className="mt-3 flex items-start gap-3">
            <input type="checkbox" className="mt-1 size-5" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
            <span>
              {/* PLACEHOLDER: ACH authorization language pending legal review */}
              I authorize Ultimate Mission to debit the bank account I provide for the amount above
              {" "}(and on the schedule I selected, if recurring). See the <a className="underline" href="/legal/ach-authorization" target="_blank">ACH Authorization</a>.
            </span>
          </label>
        </div>
      )}
      <div role="alert">{error && <p className="rounded-md bg-danger-bg p-3 text-danger">{error}</p>}</div>
      <button type="submit" disabled={!stripe || busy}
        className="min-h-12 w-full rounded-md bg-brand-700 px-8 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
        {busy ? "Processing… please do not refresh" : "Give now"}
      </button>
    </form>
  );
}

function Text({ label, value, onChange, auto, required = true }: { label: string; value: string; onChange: (v: string) => void; auto?: string; required?: boolean }) {
  const id = `t-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">{label}</label>
      <input id={id} value={value} autoComplete={auto} required={required} onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-3" />
    </div>
  );
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" className="mt-1 size-5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
