"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { startCheckout } from "@/lib/donations/actions";
import { formatMoney, dollarsToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/donor/ui";
import type { FormBlock, FormTemplateInput } from "@/lib/admin/form-template-schema";

export interface FlowTier {
  id: string; public_title: string; amount_cents: number; short_description: string | null; featured: boolean;
  allow_one_time: boolean; allow_monthly: boolean; allow_yearly: boolean; general_fund: boolean; project_id: string | null;
}
export interface FlowProject { id: string; title: string; allow_custom_amount: boolean }
export interface FlowConfig {
  tiers: FlowTier[]; projects: FlowProject[]; customEnabled: boolean; minCents: number; maxCents: number;
  publishableKey: string | null; defaults: { firstName: string; lastName: string };
  initialFrequency: Frequency; initialProjectId: string | null;
  /** A sponsored woman's gift. Her name is deliberately not passed to the form: donors never see it while giving. */
  sponsorship: { id: string; amountCents: number; remainingCents: number } | null;
  /** The signed-in donor's account email, or null for a guest giving with no account (one-time gifts only). */
  signedInEmail: string | null;
}
type Frequency = "one_time" | "monthly" | "yearly";

const STEPS = ["Destination", "Frequency", "Amount", "Your details", "Payment"] as const;
const FREQ: { id: Frequency; label: string }[] = [
  { id: "one_time", label: "One time" }, { id: "monthly", label: "Monthly" }, { id: "yearly", label: "Yearly" },
];

const choice = (active: boolean) =>
  cn("min-h-14 rounded-md border-2 px-4 py-3 text-left font-semibold transition-colors",
    active ? "border-brand-700 bg-brand-50" : "border-line bg-white hover:border-ink-soft");

function TemplateBlocks({ blocks }: { blocks: FormBlock[] }) {
  return (
    <div className="mb-8 space-y-4">
      {blocks.map((b, i) => {
        if (b.type === "headline") return <h1 key={i} className="font-display text-3xl font-semibold">{b.text}</h1>;
        if (b.type === "section_header") return <h2 key={i} className="font-display text-xl font-semibold">{b.text}</h2>;
        if (b.type === "description") return <p key={i} className="whitespace-pre-line text-ink-soft">{b.text}</p>;
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={i} src={b.url} alt={b.alt ?? ""} className="max-h-64 w-full rounded-md object-cover" />;
      })}
    </div>
  );
}

/**
 * Renders a form template's `DonateFlow`. Both the real donate page and the builder's live preview call this same
 * component with the same props, so what an admin sees while building is exactly what a donor will see.
 */
/** `embedded`: shown inside another website's frame (embed code). Payment returns to the frameless confirmation page,
 * and links that leave the form (sign in / register) open in the full browser window rather than inside the frame. */
export function DonateFlow({ config, template, previewOnly, embedded }: { config: FlowConfig; template?: FormTemplateInput; previewOnly?: boolean; embedded?: boolean }) {
  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(config.initialProjectId);
  const freqAllowed = (f: Frequency) => (config.sponsorship ? f !== "yearly" : !template || ({ one_time: template.allow_one_time, monthly: template.allow_monthly, yearly: template.allow_yearly })[f]);
  const [frequency, setFrequency] = useState<Frequency>(freqAllowed(config.initialFrequency) ? config.initialFrequency : (["one_time", "monthly", "yearly"] as const).find(freqAllowed) ?? "one_time");
  const [tierId, setTierId] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [d, setD] = useState({
    firstName: config.defaults.firstName, lastName: config.defaults.lastName, email: "", phone: "", anonymous: false,
    // Email opt-ins start ticked: new donors are opted in and can untick (see startCheckout).
    marketing: true, projectUpdates: true, dedicationKind: "" as "" | "in_honor_of" | "in_memory_of", dedicationName: "", note: "",
    organization: false, organizationName: "", addrLine1: "", addrCity: "", addrRegion: "", addrPostal: "",
  });
  const isGuest = !config.signedInEmail;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnHere = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const accent = template?.accent_color;
  const activeStyle = (active: boolean) => (active && accent ? { borderColor: accent } : undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [session, setSession] = useState<{ clientSecret: string; donationId: string } | null>(null);
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
  const sp = config.sponsorship;
  const sponsorMin = sp ? Math.min(config.minCents, sp.remainingCents) : 0;
  const partialCents = sp && frequency === "monthly" ? (custom ? customCents : sp.remainingCents) : null;
  const amountCents = sp ? (frequency === "monthly" ? partialCents : sp.amountCents) : selected?.amount_cents ?? customCents;

  function next() {
    setError(null);
    if (step === 1 && isGuest && frequency !== "one_time" && !previewOnly) {
      return setError("Recurring gifts need a free account. Choose One time, or sign in / create an account below, to continue.");
    }
    if (step === 2 && sp && frequency === "monthly") {
      if (sp.remainingCents <= 0) return setError("She is fully sponsored. Please choose another woman.");
      if (!amountCents || amountCents < sponsorMin || amountCents > sp.remainingCents)
        return setError(`Enter a monthly amount between ${formatMoney(sponsorMin)} and ${formatMoney(sp.remainingCents)}.`);
    } else if (step === 2) {
      if (!amountCents) return setError("Choose an amount to continue.");
      if (!selected && (amountCents < config.minCents || amountCents > config.maxCents))
        return setError(`Enter an amount between ${formatMoney(config.minCents)} and ${formatMoney(config.maxCents)}.`);
    }
    if (step === 3) {
      if (!d.firstName.trim() || !d.lastName.trim()) return setError("Please enter your first and last name.");
      if (isGuest && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return setError("Enter a valid email so we can send your receipt.");
      if (template?.show_address && (!d.addrLine1.trim() || !d.addrCity.trim() || !d.addrPostal.trim())) return setError("Please enter your address, city and ZIP/postal code.");
      if (d.dedicationKind && !d.dedicationName.trim()) return setError("Enter the name for your dedication, or remove it.");
      if (previewOnly) return setStep(4); // the builder's preview never charges a card or writes a donation
      return startTransition(async () => {
        const res = await startCheckout({
          idempotencyKey: key.current,
          destination: config.sponsorship ? { kind: "sponsorship", sponsorshipId: config.sponsorship.id } : projectId ? { kind: "project", projectId } : { kind: "general" },
          frequency, tierId: config.sponsorship ? null : selected?.id ?? null, customAmountCents: config.sponsorship ? (frequency === "monthly" ? partialCents : null) : selected ? null : customCents,
          donor: {
            firstName: d.firstName, lastName: d.lastName, email: config.signedInEmail ?? d.email, phone: d.phone,
            organizationName: template?.show_organization && d.organization ? d.organizationName : undefined,
            address: template?.show_address ? { line1: d.addrLine1, city: d.addrCity, region: d.addrRegion, postalCode: d.addrPostal } : undefined,
          },
          anonymous: d.anonymous, marketingOptIn: d.marketing, projectUpdatesOptIn: d.projectUpdates,
          dedication: d.dedicationKind ? { kind: d.dedicationKind, name: d.dedicationName } : null,
          note: d.note || undefined,
        });
        if (!res.ok) { key.current = crypto.randomUUID(); return setError(res.error); }
        setSession({ clientSecret: res.clientSecret, donationId: res.donationId });
        setStep(4);
      });
    }
    setStep((s) => s + 1);
  }

  const stripePromise = useMemo(() => (config.publishableKey ? loadStripe(config.publishableKey) : null), [config.publishableKey]);
  const locked = step === 4;

  return (
    <div className="mx-auto max-w-2xl" style={template ? { backgroundColor: template.background_color } : undefined}>
      <div className={template ? "rounded-lg p-6" : undefined}>
      {template && template.blocks.length > 0 && <TemplateBlocks blocks={template.blocks} />}
      <ol className="mb-8 flex gap-2 text-sm" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}
            className={cn("flex-1 border-t-4 pt-2", i <= step ? "font-semibold" : "border-line text-ink-soft")}
            style={i <= step ? { borderColor: accent ?? "var(--color-brand-700)" } : undefined}>
            <span className="sr-only">Step {i + 1}: </span><span className="hidden sm:inline">{s}</span><span className="sm:hidden">{i + 1}</span>
          </li>
        ))}
      </ol>

      <div role="alert" aria-live="assertive">
        {error && <p className="mb-4 rounded-md bg-danger-bg p-3 text-danger">{error}</p>}
      </div>

      {step === 0 && config.sponsorship && (
        <div>
          <h2 className="font-display text-2xl font-semibold">You are sponsoring a woman</h2>
          <p className="mt-2 text-lg">{formatMoney(config.sponsorship.amountCents)} per month.{config.sponsorship.remainingCents < config.sponsorship.amountCents && ` ${formatMoney(config.sponsorship.remainingCents)} per month is still needed.`} Choose monthly or a single gift on the next step.</p>
        </div>
      )}

      {step === 0 && !config.sponsorship && (
        <fieldset className="space-y-3">
          <legend className="mb-3 font-display text-2xl font-semibold">Where should your gift go?</legend>
          <button type="button" className={choice(projectId === null) + " w-full"} style={activeStyle(projectId === null)} aria-pressed={projectId === null}
            onClick={() => { setProjectId(null); setTierId(null); }}>General Fund <span className="block font-normal text-ink-soft">Used where it is needed most</span></button>
          {config.projects.map((p) => (
            <button key={p.id} type="button" className={choice(projectId === p.id) + " w-full"} style={activeStyle(projectId === p.id)} aria-pressed={projectId === p.id}
              onClick={() => { setProjectId(p.id); setTierId(null); }}>{p.title}</button>
          ))}
        </fieldset>
      )}

      {step === 1 && (
        <fieldset>
          <legend className="mb-3 font-display text-2xl font-semibold">How often would you like to give?</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {FREQ.filter((f) => freqAllowed(f.id)).map((f) => (
              <button key={f.id} type="button" className={choice(frequency === f.id)} style={activeStyle(frequency === f.id)} aria-pressed={frequency === f.id}
                onClick={() => { setFrequency(f.id); setTierId(null); }}>{f.label}</button>
            ))}
          </div>
          {isGuest && frequency !== "one_time" && !previewOnly && (
            <p className="mt-4 rounded-md bg-info-bg p-3 text-info">
              Recurring gifts need a free account so you can see, change or cancel them anytime.{" "}
              <a className="font-semibold underline" target={embedded ? "_top" : undefined} href={`/sign-in?next=${encodeURIComponent(returnHere)}`}>Sign in</a> or{" "}
              <a className="font-semibold underline" target={embedded ? "_top" : undefined} href={`/register?next=${encodeURIComponent(returnHere)}`}>create one</a>,
              or choose <strong>One time</strong> to continue without an account.
            </p>
          )}
        </fieldset>
      )}

      {step === 2 && config.sponsorship && (
        <div>
          <h2 className="font-display text-2xl font-semibold">Your gift</h2>
          {frequency === "monthly" ? (
            <div className="mt-2">
              <p className="text-lg">Give up to <strong>{formatMoney(config.sponsorship.remainingCents)}</strong> a month. Choose less to share her sponsorship. She stays listed until it is fully covered.</p>
              <label htmlFor="sponsor-amount" className="mt-4 block font-semibold">Monthly amount (USD)</label>
              <input id="sponsor-amount" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={(config.sponsorship.remainingCents / 100).toFixed(2)}
                className="mt-1.5 min-h-12 w-full max-w-xs rounded-md border border-ink-soft bg-white px-3" />
              <p className="mt-1 text-sm text-ink-soft">Leave blank to give the full {formatMoney(config.sponsorship.remainingCents)}.</p>
              <div className="mt-4 max-w-xs">
                <ProgressBar label="Her sponsorship after your gift" fundedCents={config.sponsorship.amountCents - config.sponsorship.remainingCents + (partialCents ?? 0)} totalCents={config.sponsorship.amountCents} />
              </div>
            </div>
          ) : <p className="mt-2 text-lg"><strong>{formatMoney(config.sponsorship.amountCents)}</strong> one time to sponsor a woman.</p>}
        </div>
      )}

      {step === 2 && !config.sponsorship && (
        <fieldset>
          <legend className="mb-3 font-display text-2xl font-semibold">Choose an amount</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {tiers.map((t) => (
              <button key={t.id} type="button" className={choice(tierId === t.id)} style={activeStyle(tierId === t.id)} aria-pressed={tierId === t.id}
                onClick={() => { setTierId(t.id); setCustom(""); }}>
                <span className="text-xl">{formatMoney(t.amount_cents)}</span>
                {t.featured && <span className="ml-2 rounded bg-gold px-2 py-0.5 text-xs font-semibold text-ink">Recommended</span>}
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
          <div>
            {isGuest ? (
              <Text label="Email" type="email" value={d.email} auto="email" onChange={(v) => setD({ ...d, email: v })} />
            ) : (
              <div>
                <label className="block font-semibold">Email</label>
                <input type="email" value={config.signedInEmail ?? ""} disabled aria-readonly
                  className="mt-1.5 min-h-12 w-full rounded-md border border-line bg-paper-2 px-3 text-ink-soft" />
              </div>
            )}
            {isGuest && (
              <p className="mt-1 text-sm text-ink-soft">Your receipt goes here. <a className="underline" target={embedded ? "_top" : undefined} href={`/register?email=${encodeURIComponent(d.email)}&next=${encodeURIComponent(returnHere)}`}>Create a free account</a> to see this gift and future updates in one place — optional.</p>
            )}
          </div>
          {(!template || template.show_organization) && (
            <div>
              <Check label="This is a business or organization donation" checked={d.organization} onChange={(v) => setD({ ...d, organization: v })} />
              {d.organization && <div className="mt-2"><Text label="Organization name" value={d.organizationName} onChange={(v) => setD({ ...d, organizationName: v })} /></div>}
            </div>
          )}
          {(!template || template.show_phone) && <Text label="Phone (optional)" value={d.phone} auto="tel" required={false} onChange={(v) => setD({ ...d, phone: v })} />}
          {template?.show_address && (
            <div className="space-y-4">
              <Text label="Address" value={d.addrLine1} auto="address-line1" onChange={(v) => setD({ ...d, addrLine1: v })} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Text label="City" value={d.addrCity} auto="address-level2" onChange={(v) => setD({ ...d, addrCity: v })} />
                <Text label="State/Region (optional)" value={d.addrRegion} auto="address-level1" required={false} onChange={(v) => setD({ ...d, addrRegion: v })} />
                <Text label="ZIP/Postal code" value={d.addrPostal} auto="postal-code" onChange={(v) => setD({ ...d, addrPostal: v })} />
              </div>
            </div>
          )}
          <Check label="Do not show my name publicly (give anonymously)" checked={d.anonymous} onChange={(v) => setD({ ...d, anonymous: v })} />
          <Check label="Email me news and appreciation from Ultimate Mission" checked={d.marketing} onChange={(v) => setD({ ...d, marketing: v })} />
          <Check label="Email me updates on projects I support" checked={d.projectUpdates} onChange={(v) => setD({ ...d, projectUpdates: v })} />
          <p className="text-sm text-ink-soft">Your receipt is always emailed to you, whatever you choose above.</p>
          {(!template || template.show_dedication) && (
          <div>
            <label htmlFor="ded" className="block font-semibold">Dedicate this gift (optional)</label>
            <select id="ded" value={d.dedicationKind} onChange={(e) => setD({ ...d, dedicationKind: e.target.value as typeof d.dedicationKind })}
              className="mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-3">
              <option value="">No dedication</option><option value="in_honor_of">In honor of</option><option value="in_memory_of">In memory of</option>
            </select>
            {d.dedicationKind && <div className="mt-3"><Text label="Name" value={d.dedicationName} onChange={(v) => setD({ ...d, dedicationName: v })} /></div>}
          </div>
          )}
          <div>
            <label htmlFor="note" className="block font-semibold">Note to Ultimate Mission (optional)</label>
            <textarea id="note" rows={3} maxLength={1000} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })}
              className="mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2" />
          </div>
        </div>
      )}

      {step === 4 && previewOnly && (
        <div>
          <h2 className="font-display text-2xl font-semibold">Payment</h2>
          <p className="mt-2">
            {formatMoney(amountCents ?? 0)} {FREQ.find((f) => f.id === frequency)?.label.toLowerCase()} to {config.sponsorship ? "sponsor a woman" : project?.title ?? "the General Fund"}
          </p>
          <div className="mt-6 rounded-md border-2 border-dashed border-ink-soft p-6 text-center text-ink-soft">Card and bank payment fields appear here at checkout. This preview never charges a card.</div>
          <button type="button" disabled className="mt-5 min-h-12 w-full rounded-md px-8 font-semibold text-white opacity-90"
            style={{ backgroundColor: accent ?? "var(--color-brand-700)" }}>{template?.submit_label || "Give now"}</button>
        </div>
      )}
      {step === 4 && !previewOnly && session && stripePromise && (
        <div>
          <h2 className="font-display text-2xl font-semibold">Payment</h2>
          <p className="mt-2">
            {formatMoney(amountCents ?? 0)} {FREQ.find((f) => f.id === frequency)?.label.toLowerCase()} to {config.sponsorship ? "sponsor a woman" : project?.title ?? "the General Fund"}
          </p>
          <Elements stripe={stripePromise} options={{ clientSecret: session.clientSecret, appearance: { theme: "stripe" } }}>
            <PayForm donationId={session.donationId} submitLabel={template?.submit_label} accent={accent} returnPath={embedded ? "/embed/confirmation" : undefined} />
          </Elements>
        </div>
      )}
      {step === 4 && !previewOnly && !stripePromise && <p className="rounded-md bg-warning-bg p-3 text-warning">Payments are not configured (missing publishable key).</p>}

      {!locked && (
        <div className="mt-8 flex justify-between gap-3">
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}
            className="min-h-12 rounded-md border-2 border-teal-800 px-6 font-semibold text-teal-800 disabled:invisible">Back</button>
          <button type="button" onClick={next} disabled={pending}
            className="min-h-12 rounded-md px-8 font-semibold text-white hover:brightness-95 disabled:opacity-60"
            style={{ backgroundColor: accent ?? "var(--color-brand-700)" }}>
            {pending ? "Preparing secure payment…" : step === 3 ? "Continue to payment" : "Continue"}
          </button>
        </div>
      )}
      </div>
    </div>
  );
}

/** `staff`: a staff member entering a donor's details (phone/mail gift). Device wallets (Apple Pay, Google Pay) are
 * hidden there, since they would offer the staff member's own wallet rather than the donor's. */
export function PayForm({ donationId, submitLabel, accent, returnPath = "/donate/confirmation", staff = false }: { donationId: string; submitLabel?: string; accent?: string; returnPath?: string; staff?: boolean }) {
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
    // Redirect back to whichever site the donor is on (not a configured URL), so a wrong NEXT_PUBLIC_APP_URL cannot send them elsewhere.
    // The result is only shown to the donor; payment status is set by Stripe webhooks, never by this redirect.
    const { error } = await elements.submit().then(() => stripe.confirmPayment({ elements, confirmParams: { return_url: `${window.location.origin}${returnPath}?donation=${donationId}` } }));
    if (error) { setError(error.message ?? "Payment could not be completed."); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <PaymentElement onChange={(ev) => setMethod(ev.value.type)} options={staff ? { wallets: { applePay: "never", googlePay: "never", link: "never" } } : undefined} />
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
        style={{ backgroundColor: accent ?? "var(--color-brand-700)" }}
        className="min-h-12 w-full rounded-md px-8 font-semibold text-white hover:brightness-95 disabled:opacity-60">
        {busy ? "Processing… please do not refresh" : submitLabel || "Give now"}
      </button>
    </form>
  );
}

function Text({ label, value, onChange, auto, required = true, type = "text" }: { label: string; value: string; onChange: (v: string) => void; auto?: string; required?: boolean; type?: string }) {
  const id = `t-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">{label}</label>
      <input id={id} type={type} value={value} autoComplete={auto} required={required} onChange={(e) => onChange(e.target.value)}
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
