import Link from "next/link";
import { getDonorContext } from "@/lib/donor/context";
import { getOrgSettings } from "@/lib/settings";
import { formatMoney, netSettledCents } from "@/lib/money";
import { effectiveDate, yearInZone } from "@/lib/statements";
import { SETTLED_STATUSES } from "@/lib/donations/status";
import { Empty, FREQUENCY_LABEL, Stat, StatusBadge } from "@/components/donor/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const { supabase, donor, user } = await getDonorContext();
  const settings = await getOrgSettings();

  if (!donor) {
    return (
      <Empty title="Welcome">
        <p>Signed in as {user.email}. Your giving history will appear here after your first gift.</p>
        <Link href="/donate" className="mt-4 inline-block min-h-12 rounded-md bg-brand-700 px-6 py-3 font-semibold text-white">Make a gift</Link>
      </Empty>
    );
  }

  const [{ data: donations }, { data: recurring }] = await Promise.all([
    supabase.from("donations").select("id, amount_cents, refunded_cents, status, frequency, donated_at, settled_at, project_id, projects(title)").eq("donor_id", donor.id).order("donated_at", { ascending: false }),
    supabase.from("recurring_donations").select("id, amount_cents, frequency, status, next_charge_at").eq("donor_id", donor.id),
  ]);
  const rows = donations ?? [];
  const settled = rows.filter((d) => (SETTLED_STATUSES as readonly string[]).includes(d.status));
  const thisYear = yearInZone(new Date().toISOString(), settings.timezone);
  const yearRows = settled.filter((d) => yearInZone(effectiveDate(d), settings.timezone) === thisYear);
  const active = (recurring ?? []).filter((r) => r.status === "active" || r.status === "past_due");
  const upcoming = active.filter((r) => r.next_charge_at).sort((a, b) => +new Date(a.next_charge_at!) - +new Date(b.next_charge_at!))[0];
  const projects = new Set(settled.filter((d) => d.project_id).map((d) => (d.projects as unknown as { title: string } | null)?.title).filter(Boolean));

  return (
    <>
      <h1 className="text-3xl font-semibold">Welcome back, {donor.first_name}</h1>
      <dl className="mt-8 grid grid-cols-2 gap-8 md:grid-cols-3">
        <Stat label="Lifetime confirmed giving" value={formatMoney(netSettledCents(settled), settings.currency)} hint="Settled gifts, net of refunds" />
        <Stat label={`${thisYear} giving`} value={formatMoney(netSettledCents(yearRows), settings.currency)} />
        <Stat label="Gifts" value={rows.length} />
        <Stat label="Active recurring gifts" value={active.length} />
        <Stat label="Projects supported" value={projects.size} />
        <Stat label="Next scheduled gift" value={upcoming ? new Date(upcoming.next_charge_at!).toLocaleDateString("en-US") : "None"}
          hint={upcoming ? `${formatMoney(upcoming.amount_cents, settings.currency)} ${FREQUENCY_LABEL[upcoming.frequency].toLowerCase()}` : undefined} />
      </dl>

      <h2 className="mt-12 text-2xl font-semibold">Recent gifts</h2>
      {rows.length === 0 ? <Empty title="No gifts yet"><Link className="underline" href="/donate">Make your first gift</Link></Empty> : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {rows.slice(0, 5).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span>{new Date(d.donated_at).toLocaleDateString("en-US")} · {(d.projects as unknown as { title: string } | null)?.title ?? "General Fund"}</span>
              <span className="flex items-center gap-3"><StatusBadge status={d.status} /><strong>{formatMoney(d.amount_cents, settings.currency)}</strong></span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && <p className="mt-3"><Link className="underline" href="/dashboard/contributions">See all contributions</Link></p>}
    </>
  );
}
