import Link from "next/link";
import { getDonorContext } from "@/lib/donor/context";
import { getOrgSettings } from "@/lib/settings";
import { formatMoney, netSettledCents } from "@/lib/money";
import { effectiveDate, yearInZone } from "@/lib/statements";
import { SETTLED_STATUSES } from "@/lib/donations/status";
import { Badge, Empty, FREQUENCY_LABEL, Panel, StatCard, StatusBadge } from "@/components/donor/ui";
import { donorSponsorships } from "@/lib/sponsor/holds";
import { CalendarClock, DollarSign, FolderHeart, Gift, ListChecks, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const { supabase, donor, user } = await getDonorContext();
  const settings = await getOrgSettings();

  if (!donor) {
    return (
      <>
        <h1 className="text-3xl font-semibold">Welcome</h1>
        <div className="mt-6">
          <Empty title="Your giving history will appear here">
            <p>Signed in as {user.email}. Your gifts, receipts and statements will show up after your first gift.</p>
            <Link href="/dashboard/give" className="mt-4 inline-block min-h-11 rounded-md bg-brand-700 px-6 py-2.5 font-semibold text-white hover:bg-brand-800">Make a gift</Link>
          </Empty>
        </div>
      </>
    );
  }

  const [{ data: donations }, { data: recurring }] = await Promise.all([
    supabase.from("donations").select("id, amount_cents, refunded_cents, status, frequency, donated_at, settled_at, project_id, projects(title, kind)").eq("donor_id", donor.id).order("donated_at", { ascending: false }),
    supabase.from("recurring_donations").select("id, amount_cents, frequency, status, next_charge_at, created_at, project_id, projects(kind)").eq("donor_id", donor.id),
  ]);
  const rows = donations ?? [];
  const settled = rows.filter((d) => (SETTLED_STATUSES as readonly string[]).includes(d.status));
  const thisYear = yearInZone(new Date().toISOString(), settings.timezone);
  const yearRows = settled.filter((d) => yearInZone(effectiveDate(d), settings.timezone) === thisYear);
  const active = (recurring ?? []).filter((r) => r.status === "active" || r.status === "past_due");
  const upcoming = active.filter((r) => r.next_charge_at).sort((a, b) => +new Date(a.next_charge_at!) - +new Date(b.next_charge_at!))[0];
  const projects = new Set(settled.filter((d) => d.project_id).map((d) => (d.projects as unknown as { title: string } | null)?.title).filter(Boolean));
  // "Sponsor" only while they sponsor a woman (a canceled monthly sponsorship ends it), same rule as the Sponsored worker page.
  const kindOf = (p: unknown) => (p as { kind: string } | null)?.kind;
  const sponsorshipProjects = new Set([...rows, ...(recurring ?? [])].filter((r) => kindOf(r.projects) === "sponsorship" && r.project_id).map((r) => r.project_id as string));
  const isSponsor = donorSponsorships(rows, recurring ?? [], sponsorshipProjects).size > 0;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold">Welcome back, {donor.first_name}</h1>
        {(active.length > 0 || isSponsor) && (
          <div className="flex flex-wrap gap-2">
            {active.length > 0 && <Badge tone="teal">Monthly Donor</Badge>}
            {isSponsor && <Badge tone="gold">Sponsor</Badge>}
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={DollarSign} tone="success" label="Lifetime confirmed giving" value={formatMoney(netSettledCents(settled), settings.currency)} hint="Settled gifts, net of refunds" />
        <StatCard icon={Gift} tone="brand" label={`${thisYear} giving`} value={formatMoney(netSettledCents(yearRows), settings.currency)} />
        <StatCard icon={RefreshCw} tone="teal" label="Active recurring gifts" value={active.length} />
        <StatCard icon={ListChecks} tone="brand" label="Gifts" value={rows.length} />
        <StatCard icon={FolderHeart} tone="gold" label="Projects supported" value={projects.size} />
        <StatCard icon={CalendarClock} tone="teal" label="Next scheduled gift"
          value={upcoming ? new Date(upcoming.next_charge_at!).toLocaleDateString("en-US", { timeZone: settings.timezone }) : "None"}
          hint={upcoming ? `${formatMoney(upcoming.amount_cents, settings.currency)} ${FREQUENCY_LABEL[upcoming.frequency].toLowerCase()}` : undefined} />
      </div>

      <Panel className="mt-8" title="Recent gifts" id="recent" flush
        action={rows.length > 0 && <Link className="text-sm font-semibold text-teal-600 hover:underline" href="/dashboard/contributions">See all contributions</Link>}>
        {rows.length === 0 ? <Empty bare title="No gifts yet"><Link className="text-teal-600 underline" href="/dashboard/give">Make your first gift</Link></Empty> : (
          <ul className="divide-y divide-line">
            {rows.slice(0, 5).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-paper">
                <span>{new Date(d.donated_at).toLocaleDateString("en-US", { timeZone: settings.timezone })} · {(d.projects as unknown as { title: string } | null)?.title ?? "General Fund"}</span>
                <span className="flex items-center gap-3"><StatusBadge status={d.status} /><strong>{formatMoney(d.amount_cents, settings.currency)}</strong></span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
