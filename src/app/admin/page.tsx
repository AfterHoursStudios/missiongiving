import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { TodoTable, type TodoRow } from "@/components/admin/todo-list";
import { getOrgSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { loadDashboardData } from "@/lib/admin/dashboard-data";
import { SERIES_KEYS, SERIES_TITLES, buildSeries, computeKpis, defaultRange, isSettled, netCents, parseRange, type Kpi, type SeriesKey } from "@/lib/admin/metrics";
import { ChartCard } from "@/components/admin/chart-card";
import { PrintButton } from "@/components/admin/print-button";
import { StatCard } from "@/components/donor/ui";
import { AlertTriangle, Calendar, Clock, DollarSign, Gift, Landmark, RefreshCw, TrendingUp, UserPlus, Users } from "lucide-react";

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
  const { user, perms } = await requirePermission("reports.view");
  const sp = await searchParams;
  const settings = await getOrgSettings();
  const myTodos = perms.has("donors.view") ? await loadMyTodos(user.id) : null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: settings.timezone });
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
      {myTodos && (
        <section data-panel aria-labelledby="my-todos" className="mt-6 rounded-lg border border-line bg-white shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
            <h2 id="my-todos" className="text-2xl font-bold">My to-dos</h2>
            <span className="text-sm text-ink-soft">{myTodos.length} open · add one with <span className="font-semibold">Add New → To-do</span> or from a donor row</span>
          </div>
          <div className="mt-3 overflow-x-auto border-t border-line">
            {myTodos.length === 0
              ? <p className="px-4 py-8 text-center text-ink-soft">Nothing assigned to you. <Link className="text-teal-600 underline" href="/admin/donors">Go to donors</Link></p>
              : <TodoTable todos={myTodos} canEdit={perms.has("donors.edit")} showDonor today={today} />}
          </div>
        </section>
      )}

      <p className="mt-2 text-sm text-ink-soft">Figures count settled gifts net of refunds. Pending, failed, disputed and canceled gifts are excluded.</p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={Clock} tone="teal" label="Donations today" value={money(k.today.current)} hint={<Change k={k.today} />} />
        <StatCard icon={Calendar} tone="teal" label="Donations this month" value={money(k.month.current)} hint={<Change k={k.month} />} />
        <StatCard icon={TrendingUp} tone="teal" label="Donations this year" value={money(k.year.current)} hint={<Change k={k.year} />} />
        <StatCard icon={DollarSign} tone="brand" label="Average donation (this year)" value={money(k.averageDonationCents)} />
        <StatCard icon={RefreshCw} tone="brand" label="Active recurring donors" value={k.activeRecurringDonors} />
        <StatCard icon={RefreshCw} tone="brand" label="Monthly recurring value" value={money(k.monthlyRecurringCents)} />
        <StatCard icon={RefreshCw} tone="brand" label="Yearly recurring value" value={money(k.yearlyRecurringCents)} />
        <StatCard icon={Gift} tone="gold" label="Total project funding" value={money(totalProjectFunding)} />
        <StatCard icon={UserPlus} tone="success" label="New donors this month" value={k.newDonorsThisMonth} />
        <StatCard icon={Users} tone="success" label="Returning donors this month" value={k.returningDonorsThisMonth} />
        <StatCard icon={AlertTriangle} tone={k.pastDueRecurring > 0 ? "danger" : "brand"} label="Failed or past-due recurring" value={k.pastDueRecurring} />
        <StatCard icon={Landmark} tone="gold" label="Pending ACH" value={`${k.pendingAch.count} · ${money(k.pendingAch.cents)}`} />
      </div>

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

/** Open to-dos assigned to this staff member, soonest due first. Null when the to-do table isn't set up (migration 0014). */
async function loadMyTodos(userId: string): Promise<TodoRow[] | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("donor_todos")
    .select("id, donor_id, activity, due_date, due_time, notes, completed_at, title, donor_profiles(first_name, last_name)")
    .eq("assigned_to", userId).is("completed_at", null).order("due_date").order("due_time", { nullsFirst: false }).limit(50);
  if (error) {
    // Before migration 0019 there is no title column: retry without it so donor to-dos still show.
    const legacy = await db.from("donor_todos").select("id, donor_id, activity, due_date, due_time, notes, completed_at, donor_profiles(first_name, last_name)")
      .eq("assigned_to", userId).is("completed_at", null).order("due_date").limit(50);
    if (legacy.error) return null;
    return (legacy.data ?? []).map((t) => { const d = Array.isArray(t.donor_profiles) ? t.donor_profiles[0] : t.donor_profiles; return { ...t, assignee: "Me", donor_name: d ? `${d.first_name} ${d.last_name}` : null }; });
  }
  return (data ?? []).map((t) => {
    const d = Array.isArray(t.donor_profiles) ? t.donor_profiles[0] : t.donor_profiles;
    return { ...t, assignee: "Me", donor_name: d ? `${d.first_name} ${d.last_name}` : null };
  });
}
