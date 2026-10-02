import Link from "next/link";
import { getDonorContext } from "@/lib/donor/context";
import { loadDonateSetup } from "@/lib/donations/donate-config";
import { listPaymentMethods } from "@/lib/admin/payment-on-file";
import { finalizeDonorPaymentMethodSetup } from "@/lib/donor/payment-methods";
import { heldCentsByProject } from "@/lib/sponsor/sponsored";
import { remainingCents } from "@/lib/sponsor/holds";
import { reconcileDonation } from "@/lib/stripe/reconcile-donation";
import { designationLabel } from "@/lib/donations/designation";
import { getOrgSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { STATUS_LABELS, type DonationStatus } from "@/lib/donations/status";
import { AutoRefresh } from "@/components/donate/auto-refresh";
import { GiveForm, type GiveWoman } from "@/components/donor/give-form";
import { Empty, FREQUENCY_LABEL, Panel } from "@/components/donor/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Give" };

type SP = { to?: string; sponsor?: string; project?: string; frequency?: string; donation?: string; setup_intent?: string };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function GivePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, donor, user } = await getDonorContext();

  if (sp.donation && UUID.test(sp.donation)) return <ThankYou donationId={sp.donation} />;

  if (!donor) {
    return (
      <>
        <h1 className="text-3xl font-semibold">Give</h1>
        <div className="mt-6">
          <Empty title="Make your first gift">
            <p>Your first gift sets up your account for giving from here with a saved card.</p>
            <Link href="/donate" className="mt-4 inline-block min-h-11 rounded-md bg-brand-700 px-6 py-2.5 font-semibold text-white hover:bg-brand-800">Give now</Link>
          </Empty>
        </div>
      </>
    );
  }

  // Back from adding a card or bank account mid-gift: save it (without moving existing recurring gifts) and pick it.
  const added = sp.setup_intent ? await finalizeDonorPaymentMethodSetup(sp.setup_intent, false) : null;

  // A sponsorship is chosen on the Sponsor a Woman page (?sponsor=<id>); this page never lists the women itself.
  const sponsorId = sp.sponsor && UUID.test(sp.sponsor) ? sp.sponsor : null;
  const [donate, { methods, error }, { data: sponsorship }] = await Promise.all([
    loadDonateSetup(),
    listPaymentMethods(donor.stripe_customer_id),
    sponsorId
      ? supabase.from("sponsorships").select("id, project_id, name, country, monthly_amount_cents").eq("id", sponsorId).eq("status", "active").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (donate.state !== "ready") return <p className="rounded-md bg-warning-bg p-4 text-warning">Giving is not available right now.</p>;
  const c = donate.config;
  const left = sponsorship ? remainingCents(sponsorship.monthly_amount_cents, (await heldCentsByProject()).get(sponsorship.project_id) ?? 0) : 0;
  const woman: GiveWoman | null = sponsorship && left > 0
    ? { id: sponsorship.id, name: sponsorship.name, country: sponsorship.country, monthlyCents: sponsorship.monthly_amount_cents, remainingCents: left }
    : null;
  if (sponsorId && !woman) {
    return (
      <>
        <h1 className="text-3xl font-semibold">Sponsor a woman</h1>
        <div className="mt-6">
          <Empty title="She is already fully sponsored">
            <p>Thank you for wanting to help. Please choose another woman to sponsor.</p>
            <Link href="/sponsor" className="mt-4 inline-block min-h-11 rounded-md bg-brand-700 px-6 py-2.5 font-semibold text-white hover:bg-brand-800">Sponsor a woman</Link>
          </Empty>
        </div>
      </>
    );
  }

  // Where to start: ?to=general|project:<id>, or the public site's ?project= links.
  const wanted = sp.to ?? (sp.project ? `project:${sp.project}` : "general");
  const [k, id] = wanted.split(":");
  const dest = k === "project" && c.projects.some((p) => p.id === id) ? wanted : "general";
  const frequency = sp.frequency === "monthly" || sp.frequency === "yearly" ? sp.frequency : woman ? "monthly" : "one_time";

  return (
    <>
      <h1 className="text-3xl font-semibold">{woman ? "Sponsor a woman" : "Give"}</h1>
      <p className="mt-1 text-ink-soft">{woman ? "Sponsor her" : "Give to the General Fund or a project"} with a card or bank account saved on your account.</p>
      {added && (added.pendingVerification
        ? <p role="alert" className="mt-4 rounded-md bg-info-bg p-3 text-info">Bank account added. It needs a quick check (two small deposits, 1–2 business days) before it can be used. Choose a card for now, or come back once it&apos;s verified.</p>
        : <p role="alert" className={`mt-4 rounded-md p-3 ${added.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>{added.ok ? "Payment method saved. It's selected below." : added.error}</p>)}
      {error && <p className="mt-4 rounded-md bg-warning-bg p-3 text-warning">{error}</p>}
      <div className="mt-6">
        <GiveForm
          setup={{
            tiers: c.tiers, projects: c.projects, woman, customEnabled: c.customEnabled, minCents: c.minCents, maxCents: c.maxCents,
            publishableKey: c.publishableKey, donor: { firstName: donor.first_name, lastName: donor.last_name, email: user.email ?? donor.email },
            methods: methods.filter((m) => m.type !== "link"),
          }}
          initial={{ dest, frequency, paymentMethodId: added?.ok ? added.paymentMethodId ?? null : null }}
        />
      </div>
    </>
  );
}

/** After giving: the gift's status, confirmed straight from Stripe (refreshes itself while the payment is in flight). */
async function ThankYou({ donationId }: { donationId: string }) {
  await reconcileDonation(donationId);
  const { supabase } = await getDonorContext();
  // Row-level security: a donor can only load their own donation.
  const { data: d } = await supabase.from("donations").select("id, amount_cents, frequency, status, payment_method, project_id").eq("id", donationId).maybeSingle();
  if (!d) return <Empty title="Gift not found"><Link className="text-teal-600 underline" href="/dashboard/give">Make a gift</Link></Empty>;
  const [settings, designation] = await Promise.all([getOrgSettings(), designationLabel(d.project_id)]);
  const status = d.status as DonationStatus;
  const inFlight = status === "pending" || (status === "processing" && d.payment_method !== "us_bank_account");
  const failed = status === "failed" || status === "canceled";

  return (
    <>
      {inFlight && <AutoRefresh />}
      <h1 className="text-3xl font-semibold">{failed ? "Your payment did not go through" : inFlight ? "Confirming your gift…" : "Thank you!"}</h1>
      <Panel className="mt-6 max-w-2xl">
        <p className="text-2xl font-semibold">{formatMoney(d.amount_cents, settings.currency)} <span className="text-base font-normal text-ink-soft">{FREQUENCY_LABEL[d.frequency].toLowerCase()}</span></p>
        <p className="font-semibold">{designation}</p>
        <p className="mt-2 text-ink-soft">Status: <strong className="text-ink">{STATUS_LABELS[status] ?? status}</strong></p>
        {status === "processing" && d.payment_method === "us_bank_account" && <p className="mt-2 text-ink-soft">Bank payments take a few business days to clear. We&apos;ll email your receipt once it does.</p>}
        {inFlight && <p className="mt-2 text-ink-soft">This page updates automatically. Please don&apos;t give again.</p>}
        {failed && <p className="mt-2 text-ink-soft">You have not been charged. Try again with another payment method.</p>}
        <div className="mt-5 flex flex-wrap gap-3 border-t border-line pt-4">
          <Link href="/dashboard/give" className="inline-flex min-h-11 items-center rounded-md bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800">{failed ? "Try again" : "Give again"}</Link>
          <Link href="/dashboard/contributions" className="inline-flex min-h-11 items-center rounded-md border-2 border-teal-800 px-5 font-semibold text-teal-800 hover:bg-paper-2">See my contributions</Link>
        </div>
      </Panel>
    </>
  );
}
