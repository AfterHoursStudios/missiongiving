import { ArrowDown, ArrowUp, Minus, TrendingUp } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { loadDashboard, stateShapes } from "@/lib/reports/dashboard-data";
import { formatMoney } from "@/lib/money";
import { DashChart } from "@/components/admin/dash-chart";
import { GoalForm } from "@/components/admin/goal-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organization dashboard" };

/** Sequential blue ramp (light → dark) for the state map; dataviz reference steps 150–700. */
const RAMP = ["#b7d3f6", "#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281", "#0d366b"];
const NO_GIFTS = "#f0efec";

// min-w-0: a chart sizes to its card, never the other way round (no sideways scrolling on phones).
const card = "min-w-0 rounded-xl border border-line bg-white p-4 shadow-sm";

export default async function DashboardPage() {
  const { perms } = await requirePermission("reports.view");
  const { dash, states, currency } = await loadDashboard();
  const money = (c: number) => formatMoney(c, currency);
  const { kpis, goal } = dash;

  const maxState = Math.max(0, ...states.map((s) => s.cents));
  const byState = new Map(states.map((s) => [s.state, s]));
  const shade = (cents: number) => (cents <= 0 || maxState <= 0 ? NO_GIFTS : RAMP[Math.min(RAMP.length - 1, Math.floor((cents / maxState) * RAMP.length))]);

  return (
    <>
      <h1 className="flex items-center gap-3 text-3xl font-semibold"><TrendingUp aria-hidden="true" className="text-success" size={30} />Organization Dashboard</h1>
      <p className="mt-1 text-ink-soft">Settled gifts, net of refunds. &ldquo;This year&rdquo; means the last 12 months; YoY compares with the 12 months before.</p>

      <section aria-labelledby="goal-h" className={`${card} mt-6`}>
        <h2 id="goal-h" className="font-semibold">Annual Fundraising Goal <span className="font-normal text-ink-soft">· fiscal year {goal.fiscalYearLabel}</span></h2>
        <div role="progressbar" aria-labelledby="goal-h" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, goal.pct ?? 0)}
          aria-valuetext={goal.cents ? `${money(goal.raised)} of ${money(goal.cents)}` : `${money(goal.raised)} raised; no goal set`}
          className="relative mt-3 h-6 overflow-hidden rounded-full bg-paper-2">
          <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${Math.min(100, goal.pct ?? 0)}%` }} />
          <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">{goal.pct === null ? "No goal set" : `${goal.pct}%`}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
          <p className="pt-2.5 text-sm text-ink-soft">{money(goal.raised)} raised so far{goal.cents ? ` of ${money(goal.cents)}` : ""}.</p>
          {perms.has("settings.manage") && <GoalForm currentDollars={goal.cents ? String(goal.cents / 100) : ""} />}
        </div>
      </section>

      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi title="Growth in Giving" value={kpis.growth.pct === null ? "—" : `${kpis.growth.pct}%`}
          change={kpis.growth.deltaCents} changeText={`${kpis.growth.deltaCents >= 0 ? "+" : "−"}${money(Math.abs(kpis.growth.deltaCents))}`} hint="Giving this year vs. last year" />
        <Kpi title="Donor Retention" value={kpis.retention.pct === null ? "—" : `${kpis.retention.pct}%`}
          change={kpis.retention.changePts} changeText={kpis.retention.changePts === null ? "" : `${kpis.retention.changePts >= 0 ? "+" : "−"}${Math.abs(kpis.retention.changePts)} pts YoY`} hint="Last year's donors who gave again" />
        <Kpi title="Total Donors" value={kpis.donors.value.toLocaleString("en-US")} change={kpis.donors.changePct} changeText={pctText(kpis.donors.changePct)} hint="Donors who gave this year" />
        <Kpi title="Average Gift" value={money(kpis.averageGift.value)} change={kpis.averageGift.changePct} changeText={pctText(kpis.averageGift.changePct)} hint="This year's gifts" />
        <Kpi title="Donor Lifetime Value" value={money(kpis.lifetimeValue.value)} change={kpis.lifetimeValue.changePct} changeText={pctText(kpis.lifetimeValue.changePct)} hint="Average total given per donor" />
      </ul>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="c1" className={card}>
          <h2 id="c1" className="font-semibold">Growth in Giving</h2><p className="text-sm text-ink-soft">Each of the last 12 months, compared with the same month a year earlier</p>
          <DashChart kind="line" title="Growth in Giving" xKey="month" format="money" data={dash.monthlyGiving}
            series={[{ key: "current", label: "Current year", slot: 0 }, { key: "previous", label: "Previous year", slot: 1 }]} />
        </section>
        <section aria-labelledby="c2" className={card}>
          <h2 id="c2" className="font-semibold">Donor Retention</h2><p className="text-sm text-ink-soft">Rolling 12-month retention at the end of each month</p>
          <DashChart kind="line" title="Donor Retention" xKey="month" format="percent" data={dash.retentionTrend}
            series={[{ key: "current", label: "Current year", slot: 0 }, { key: "previous", label: "Previous year", slot: 1 }]} />
        </section>
        <section aria-labelledby="c3" className={card}>
          <h2 id="c3" className="font-semibold">Donation History Cycle</h2><p className="text-sm text-ink-soft">Giving by calendar month, past 3 years</p>
          <DashChart kind="bar" title="Donation History Cycle" xKey="month" format="money"
            data={dash.historyCycle.rows.map((r) => ({ month: r.month, ...Object.fromEntries(dash.historyCycle.years.map((y, i) => [`y${y}`, r.values[i]])) }))}
            series={dash.historyCycle.years.map((y, i, all) => ({ key: `y${y}`, label: String(y), slot: (all.length - 1 - i) as 0 | 1 | 2 }))} />
        </section>
        <section aria-labelledby="c4" className={card}>
          <h2 id="c4" className="font-semibold">Donor Retention by Status</h2>
          <p className="text-sm text-ink-soft">New: first gift ever. Retained: also gave the year before. Reactivated: came back after a gap. Lapsed: gave the year before but not this year.</p>
          <DashChart kind="bar" title="Donor Retention by Status" xKey="status" format="count" yLabel="Donors" data={dash.statuses}
            series={[{ key: "current", label: "Current year", slot: 0 }, { key: "previous", label: "Previous year", slot: 1 }]} />
        </section>
        <section aria-labelledby="c5" className={card}>
          <h2 id="c5" className="font-semibold">Giving by State</h2><p className="text-sm text-ink-soft">Last 12 months, by the donor&apos;s address. Hover a state for its total.</p>
          {states.length === 0 ? <p className="mt-3 rounded-md bg-paper-2 p-6 text-center text-ink-soft">No gifts from donors with a US address in the last 12 months.</p> : (<>
            <svg viewBox="0 0 975 610" role="img" aria-label="Map of giving by state. The same numbers are in the table below the map." className="mt-3 h-auto w-full">
              {stateShapes().map((s) => {
                const v = byState.get(s.name);
                return <path key={s.name} d={s.d} fill={shade(v?.cents ?? 0)} stroke="#ffffff" strokeWidth={1}>
                  <title>{`${s.name}: ${v ? `${money(v.cents)} from ${v.donors} donor${v.donors === 1 ? "" : "s"}` : "no gifts"}`}</title>
                </path>;
              })}
            </svg>
            <div className="mt-2 flex items-center gap-2 text-xs text-ink-soft" aria-hidden="true">
              <span>{money(Math.min(...states.map((s) => s.cents).filter((c) => c > 0)))}</span>
              <span className="h-2.5 flex-1 rounded-full" style={{ background: `linear-gradient(to right, ${RAMP.join(", ")})` }} />
              <span>{money(maxState)}</span>
            </div>
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-teal-600 underline">View as table</summary>
              <table className="w-full text-left text-sm"><caption className="sr-only">Giving by state</caption>
                <thead><tr className="border-b-2 border-ink"><th scope="col" className="py-1.5 pr-4">State</th><th scope="col" className="py-1.5 pr-4 text-right">Donors</th><th scope="col" className="py-1.5 pr-4 text-right">Giving</th></tr></thead>
                <tbody>{states.map((s) => <tr key={s.state} className="border-b border-line"><th scope="row" className="py-1.5 pr-4 font-normal">{s.state}</th>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{s.donors}</td><td className="py-1.5 pr-4 text-right tabular-nums">{money(s.cents)}</td></tr>)}</tbody>
              </table>
            </details>
          </>)}
        </section>
      </div>
    </>
  );
}

const pctText = (p: number | null) => (p === null ? "" : `${p >= 0 ? "+" : "−"}${Math.abs(p)}% YoY`);

/** A headline number with its year-over-year change: an arrow and words as well as color, never color alone. */
function Kpi({ title, value, change, changeText, hint }: { title: string; value: string; change: number | null; changeText: string; hint: string }) {
  const dir = change === null || change === 0 ? "flat" : change > 0 ? "up" : "down";
  const Icon = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : Minus;
  return (
    <li className={`${card} text-center`}>
      <h2 className="text-sm font-semibold text-ink-soft">{title}</h2>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {changeText ? (
        <p className={`mt-1 inline-flex items-center gap-1 text-sm font-semibold ${dir === "up" ? "text-success" : dir === "down" ? "text-danger" : "text-ink-soft"}`}>
          <Icon aria-hidden="true" size={16} /><span><span className="sr-only">{dir === "up" ? "Up" : dir === "down" ? "Down" : "No change"}: </span>{changeText}</span>
        </p>
      ) : <p className="mt-1 text-sm text-ink-soft">No earlier data</p>}
      <p className="mt-1 text-xs text-ink-soft">{hint}</p>
    </li>
  );
}
