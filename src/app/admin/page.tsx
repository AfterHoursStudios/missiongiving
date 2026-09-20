import { requirePermission } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { loadDashboardData } from "@/lib/admin/dashboard-data";
import { SERIES_KEYS, SERIES_TITLES, buildSeries, computeKpis, defaultRange, isSettled, netCents, parseRange, type Kpi, type SeriesKey } from "@/lib/admin/metrics";
import { ChartCard } from "@/components/admin/chart-card";
import { PrintButton } from "@/components/admin/print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const DESCRIPTIONS: Record<SeriesKey, string> = {
  "revenue": "Settled gifts net of refunds, by month.", "by-designation": "Net settled gifts by General Fund or project.",
  "one-time-vs-recurring": "Net settled gifts by frequency, by month.", "tiers": "Gift counts and totals by donation tier; gifts not using a tier are shown as custom.",
  "payment-method": "Net settled gifts by payment method.", "new-vs-returning": "Donors giving each month whose first-ever settled gift was that month, versus earlier donors.",
  "retention": "Share of a year's donors who gave again the next year (all years).", "goal-progress": "Amount raised toward each project's goal (includes offline adjustments).",
  "revenue-expenses": "Settled revenue less approved expenses. Management view; have your accountant review before official use.",
};

function Change({ k }: { k: Kpi }) {
  if (k.changePct === null) return <span className="text-sm text-ink-soft">No prior-period data</span>;
  const up = k.changePct >= 0;
  return <span className={`text-sm font-semibold ${up ? "text-success" : "text-danger"}`}>{up ? "▲ up" : "▼ down"} {Math.abs(k.changePct)}% <span className="font-normal text-ink-soft">vs previous</span></span>;
}

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requirePermission("reports.view");
  const sp = await searchParams;
  const settings = await getOrgSettings();
  const data = await loadDashboardData();
  const now = new Date();
  const range = parseRange(sp.from, sp.to, defaultRange(now, settings.timezone));
  const k = computeKpis(data.donations, data.recurring, now, settings.timezone);
  const money = (c: number) => formatMoney(c, settings.currency);
  const recent = [...data.donations].sort((a, b) => +new Date(b.donated_at) - +new Date(a.donated_at)).slice(0, 8);
  const deadlines = data.projects.filter((p) => p.end_date && p.status !== "completed").sort((a, b) => a.end_date!.localeCompare(b.end_date!)).slice(0, 5);
  const totalProjectFunding = data.donations.filter((d) => isSettled(d) && d.designation !== "General Fund").reduce((s, d) => s + netCents(d), 0)
    + data.projects.reduce((s, p) => s + p.offline_adjustment_cents, 0);
  const qs = `from=${range.from}&to=${range.to}`;
  const input = { donations: data.donations, expenses: data.expenses, projects: data.projects, tz: settings.timezone, range };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <PrintButton />
      </div>
      <p className="mt-2 text-sm text-ink-soft">Figures count settled gifts net of refunds. Pending, failed, disputed and canceled gifts are excluded.</p>

      <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
        {([["Donations today", k.today], ["Donations this month", k.month], ["Donations this year", k.year]] as const).map(([label, v]) => (
          <div key={label}><dt className="text-sm text-ink-soft">{label}</dt><dd className="font-display text-3xl font-semibold text-brand-800">{money(v.current)}</dd><Change k={v} /></div>
        ))}
        <Metric label="Average donation (this year)" value={money(k.averageDonationCents)} />
        <Metric label="Active recurring donors" value={k.activeRecurringDonors} />
        <Metric label="Monthly recurring value" value={money(k.monthlyRecurringCents)} />
        <Metric label="Yearly recurring value" value={money(k.yearlyRecurringCents)} />
        <Metric label="Total project funding" value={money(totalProjectFunding)} />
        <Metric label="New donors this month" value={k.newDonorsThisMonth} />
        <Metric label="Returning donors this month" value={k.returningDonorsThisMonth} />
        <Metric label="Failed or past-due recurring" value={k.pastDueRecurring} alert={k.pastDueRecurring > 0} />
        <Metric label="Pending ACH" value={`${k.pendingAch.count} · ${money(k.pendingAch.cents)}`} />
      </dl>

      <div className="mt-10 grid gap-10 md:grid-cols-2">
        <section aria-labelledby="recent">
          <h2 id="recent" className="text-2xl font-semibold">Recent donations</h2>
          {recent.length === 0 ? <p className="mt-3 text-ink-soft">No donations yet.</p> : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {recent.map((d) => (
                <li key={d.id} className="flex justify-between gap-3 py-2"><span>{new Date(d.donated_at).toLocaleDateString("en-US", { timeZone: settings.timezone })} · {d.designation}</span><span><strong>{money(d.amount_cents)}</strong> <span className="text-sm text-ink-soft">{d.status.replace("_", " ")}</span></span></li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="deadlines">
          <h2 id="deadlines" className="text-2xl font-semibold">Upcoming project deadlines</h2>
          {deadlines.length === 0 ? <p className="mt-3 text-ink-soft">No projects with end dates.</p> : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {deadlines.map((p) => <li key={p.id} className="flex justify-between py-2"><span>{p.title}</span><span>{p.end_date}</span></li>)}
            </ul>
          )}
        </section>
      </div>

      <h2 className="mt-14 text-2xl font-semibold">Charts</h2>
      <form method="get" className="mt-3 flex flex-wrap items-end gap-3 no-print" aria-label="Chart date range">
        <div><label htmlFor="from" className="block text-sm font-semibold">From</label><input id="from" type="date" name="from" defaultValue={range.from} className="min-h-11 rounded-md border border-ink-soft bg-white px-2" /></div>
        <div><label htmlFor="to" className="block text-sm font-semibold">To</label><input id="to" type="date" name="to" defaultValue={range.to} className="min-h-11 rounded-md border border-ink-soft bg-white px-2" /></div>
        <button className="min-h-11 rounded-md bg-teal-800 px-5 font-semibold text-white">Apply</button>
      </form>
      <p className="mt-2 text-sm text-ink-soft">Showing {range.from} to {range.to}. Goal progress and retention cover all time.</p>
      <div className="mt-6 space-y-10">
        {SERIES_KEYS.map((key) => (
          <ChartCard key={key} id={key} title={SERIES_TITLES[key]} description={DESCRIPTIONS[key]} table={buildSeries(key, input)} csvHref={`/admin/export/${key}?${qs}`} />
        ))}
      </div>
    </>
  );
}

function Metric({ label, value, alert }: { label: string; value: React.ReactNode; alert?: boolean }) {
  return <div><dt className="text-sm text-ink-soft">{label}</dt><dd className={`font-display text-3xl font-semibold ${alert ? "text-danger" : "text-brand-800"}`}>{value}</dd></div>;
}
