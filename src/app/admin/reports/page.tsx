import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { runReport } from "@/lib/reports/request";
import { DISCLAIMER, cell } from "@/lib/reports/sections";
import { PrintButton } from "@/components/admin/print-button";
import { getOrgSettings } from "@/lib/settings";
import { currentMonthKey } from "@/lib/reports/pnl";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financial reports" };

const sel = "min-h-11 rounded-md border border-ink-soft bg-white px-2";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { perms } = await requirePermission("reports.view");
  const pnlMonth = currentMonthKey((await getOrgSettings()).timezone); // default month for the Excel P&L download
  const sp = await searchParams;
  const r = await runReport(sp, perms);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  const exportHref = (format: string) => { const p = new URLSearchParams(qs); p.set("format", format); p.set("type", r.type); return `/admin/reports/export?${p}`; };
  const typeHref = (t: string) => { const p = new URLSearchParams(qs); p.set("type", t); return `?${p}`; };
  const years = [...new Set([...r.data.donations.map((d) => (d.settled_at ?? d.donated_at).slice(0, 4)), new Date().getFullYear().toString()])].sort().reverse();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Financial reports</h1>
        <div className="flex flex-wrap gap-3 no-print"><PrintButton />
          <a className="min-h-11 rounded-md bg-teal-800 px-4 py-2.5 font-semibold text-white" href={exportHref("pdf")}>Download PDF</a>
          <a className="min-h-11 rounded-md border-2 border-teal-800 px-4 py-2 font-semibold text-teal-800" href={exportHref("csv")}>Download CSV</a></div>
      </div>

      <p role="note" className="mt-4 rounded-md bg-warning-bg p-3 text-warning">{DISCLAIMER}</p>
      <section aria-labelledby="pnl-xlsx" className="mt-6 max-w-3xl rounded-lg border border-line bg-white p-4 shadow-sm no-print">
        <h2 id="pnl-xlsx" className="text-xl font-semibold">Monthly P&amp;L (Excel)</h2>
        <p className="mt-1 text-sm text-ink-soft">Revenue, expenses and net for the month, compared with the prior month (gain or loss in $ and %), with year-to-date totals and a second sheet showing every month of the year.</p>
        <form method="get" action="/admin/reports/pnl" className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="pnl-month" className="block text-sm font-semibold">Month</label>
            <input id="pnl-month" name="month" type="month" required defaultValue={pnlMonth}
              className="min-h-11 rounded-md border border-ink-soft bg-white px-2" />
          </div>
          <button className="min-h-11 rounded-md bg-teal-800 px-5 font-semibold text-white">Download P&amp;L (.xlsx)</button>
        </form>
      </section>
      <nav aria-label="Report type" className="mt-6 flex gap-6 no-print">
        <Link href={typeHref("pl")} aria-current={r.type === "pl" ? "page" : undefined} className={`min-h-11 py-2 font-semibold ${r.type === "pl" ? "border-b-4 border-brand-700" : "underline"}`}>Management P&amp;L</Link>
        <Link href={typeHref("soa")} aria-current={r.type === "soa" ? "page" : undefined} className={`min-h-11 py-2 font-semibold ${r.type === "soa" ? "border-b-4 border-brand-700" : "underline"}`}>Statement of Activities</Link>
      </nav>
      <p className="mt-3 max-w-prose text-sm text-ink-soft">
        {r.type === "soa"
          ? "The Statement of Activities is generally the nonprofit-oriented report: it shows revenue and expenses by donor restriction and by function (program, fundraising, management)."
          : "The management P&L is the familiar operational view: revenue less expenses and payment-processing fees, giving a net operating result."}
      </p>

      <form method="get" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 no-print" aria-label="Report filters">
        <input type="hidden" name="type" value={r.type} />
        <div><label htmlFor="from" className="block text-sm font-semibold">From</label><input id="from" type="date" name="from" defaultValue={r.filters.from} className={sel + " w-full"} /></div>
        <div><label htmlFor="to" className="block text-sm font-semibold">To</label><input id="to" type="date" name="to" defaultValue={r.filters.to} className={sel + " w-full"} /></div>
        <div><label htmlFor="year" className="block text-sm font-semibold">Or calendar year</label><select id="year" name="year" defaultValue={sp.year ?? ""} className={sel + " w-full"}><option value="">Use dates</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
        <div><label htmlFor="fund" className="block text-sm font-semibold">Fund</label><select id="fund" name="fund" defaultValue={r.filters.fundId ?? ""} className={sel + " w-full"}><option value="">All</option>{r.data.funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
        <div><label htmlFor="project" className="block text-sm font-semibold">Project</label><select id="project" name="project" defaultValue={r.filters.projectId ?? ""} className={sel + " w-full"}><option value="">All</option>{r.data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
        <div><label htmlFor="frequency" className="block text-sm font-semibold">Frequency</label><select id="frequency" name="frequency" defaultValue={r.filters.frequency ?? ""} className={sel + " w-full"}><option value="">All</option><option value="one_time">One time</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></div>
        <div><label htmlFor="method" className="block text-sm font-semibold">Payment method</label><select id="method" name="method" defaultValue={r.filters.method ?? ""} className={sel + " w-full"}><option value="">All</option><option value="card">Card</option><option value="us_bank_account">Bank (ACH)</option><option value="offline">Offline</option></select></div>
        <div><label htmlFor="status" className="block text-sm font-semibold">Donation status</label><select id="status" name="status" defaultValue={r.filters.status ?? ""} className={sel + " w-full"}><option value="">All settled</option><option value="succeeded">Succeeded</option><option value="partially_refunded">Partially refunded</option><option value="refunded">Refunded</option></select></div>
        <div><label htmlFor="category" className="block text-sm font-semibold">Expense category</label><select id="category" name="category" defaultValue={r.filters.categoryId ?? ""} className={sel + " w-full"}><option value="">All</option>{r.data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label htmlFor="restriction" className="block text-sm font-semibold">Restricted / unrestricted</label><select id="restriction" name="restriction" defaultValue={r.filters.restriction ?? ""} className={sel + " w-full"}><option value="">Both</option><option value="unrestricted">Unrestricted</option><option value="restricted">Restricted</option></select></div>
        {perms.has("donors.view") && <div><label htmlFor="donor_email" className="block text-sm font-semibold">Donor email</label><input id="donor_email" name="donor_email" type="email" defaultValue={sp.donor_email ?? ""} className={sel + " w-full"} /></div>}
        <div className="flex items-end gap-3"><button className="min-h-11 rounded-md bg-teal-800 px-5 font-semibold text-white">Apply filters</button><Link className="min-h-11 py-2 underline" href={`?type=${r.type}`}>Clear</Link></div>
      </form>
      <p className="mt-2 text-sm text-ink-soft">Donation status options cover settled gifts only. Pending, failed and canceled gifts are never revenue.</p>

      <div className="mt-8 space-y-10">
        <p className="sr-only">Report for {r.filters.from} to {r.filters.to}</p>
        {r.sections.map((s) => (
          <section key={s.title} aria-labelledby={`s-${s.title}`} className="print:break-inside-avoid">
            <h2 id={`s-${s.title}`} className="text-2xl font-semibold">{s.title}</h2>
            {s.note && <p className="text-sm text-ink-soft">{s.note}</p>}
            {s.rows.length === 0 ? <p className="mt-2 text-ink-soft">No data for these filters.</p> : (
              <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[30rem] text-left">
                <caption className="sr-only">{s.title}</caption>
                <thead><tr className="border-b-2 border-ink">{s.columns.map((c, i) => <th key={c + i} scope="col" className={`py-2 pr-4 ${i > 0 ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
                <tbody>{s.rows.map((row, ri) => (
                  <tr key={ri} className={`border-b border-line ${/^(Net |Total|Change)/.test(String(row[0])) ? "font-semibold" : ""}`}>
                    {row.map((v, i) => <td key={i} className={`py-2 pr-4 ${i > 0 ? "text-right tabular-nums" : ""}`}>{cell(v, s.money.includes(i), r.settings.currency)}</td>)}
                  </tr>))}</tbody></table></div>
            )}
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm text-ink-soft">Generated {new Date().toLocaleString("en-US", { timeZone: r.settings.timezone })} · {r.settings.legal_name}</p>
    </>
  );
}
