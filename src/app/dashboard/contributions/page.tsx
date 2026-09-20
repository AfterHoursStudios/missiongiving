import Link from "next/link";
import { getDonorContext } from "@/lib/donor/context";
import { getOrgSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { yearInZone } from "@/lib/statements";
import { STATUS_LABELS, isReceiptFinal, type DonationStatus } from "@/lib/donations/status";
import { filterContributions, type ContributionRow } from "@/lib/donor/contributions";
import { Empty, FREQUENCY_LABEL, METHOD_LABEL, StatusBadge } from "@/components/donor/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contributions" };

type SP = { q?: string; status?: string; frequency?: string; year?: string; page?: string };

export default async function ContributionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, donor } = await getDonorContext();
  const settings = await getOrgSettings();

  const { data } = donor
    ? await supabase.from("donations")
        .select("id, donated_at, amount_cents, payment_method, frequency, status, projects(title), receipts(receipt_number, is_final)")
        .eq("donor_id", donor.id).order("donated_at", { ascending: false }).limit(1000)
    : { data: [] };

  const all: ContributionRow[] = (data ?? []).map((d) => {
    const rc = Array.isArray(d.receipts) ? d.receipts[0] : d.receipts;
    return {
      id: d.id, donated_at: d.donated_at, amount_cents: d.amount_cents, payment_method: d.payment_method, frequency: d.frequency,
      status: d.status, designation: (d.projects as unknown as { title: string } | null)?.title ?? "General Fund",
      receipt_number: (rc as { receipt_number: string } | null)?.receipt_number ?? null,
    };
  });

  const year = Number(sp.year) || undefined;
  const result = filterContributions(all, { q: sp.q, status: sp.status, frequency: sp.frequency, year, page: Number(sp.page) || 1 },
    (iso) => yearInZone(iso, settings.timezone));
  const years = [...new Set(all.map((r) => yearInZone(r.donated_at, settings.timezone)))].sort((a, b) => b - a);
  const qs = (page: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, status: sp.status, frequency: sp.frequency, year: sp.year })) if (v) p.set(k, v);
    p.set("page", String(page));
    return `?${p}`;
  };
  const sel = "min-h-11 rounded-md border border-ink-soft bg-white px-2";

  return (
    <>
      <h1 className="text-3xl font-semibold">Contributions</h1>
      <form method="get" className="mt-6 flex flex-wrap items-end gap-3" role="search" aria-label="Filter contributions">
        <div><label htmlFor="q" className="block text-sm font-semibold">Search</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Project or receipt number" className={sel + " w-56"} /></div>
        <div><label htmlFor="status" className="block text-sm font-semibold">Status</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className={sel}>
            <option value="">All</option>{Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label htmlFor="frequency" className="block text-sm font-semibold">Frequency</label>
          <select id="frequency" name="frequency" defaultValue={sp.frequency ?? ""} className={sel}>
            <option value="">All</option>{Object.entries(FREQUENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label htmlFor="year" className="block text-sm font-semibold">Year</label>
          <select id="year" name="year" defaultValue={sp.year ?? ""} className={sel}>
            <option value="">All</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
        <button className="min-h-11 rounded-md bg-teal-800 px-5 font-semibold text-white">Apply</button>
        <Link href="/dashboard/contributions" className="min-h-11 py-2 underline">Clear</Link>
      </form>

      {result.total === 0 ? (
        <div className="mt-8"><Empty title={all.length ? "No contributions match your filters" : "No contributions yet"}>
          {all.length === 0 && <Link className="underline" href="/donate">Make your first gift</Link>}</Empty></div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left">
            <caption className="sr-only">Your contributions, {result.total} total</caption>
            <thead><tr className="border-b-2 border-ink">
              {["Date", "Amount", "Method", "Frequency", "Designation", "Status", "Receipt"].map((h) => <th key={h} scope="col" className="py-2 pr-4 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.id} className="border-b border-line align-top">
                  <td className="py-3 pr-4">{new Date(r.donated_at).toLocaleDateString("en-US", { timeZone: settings.timezone })}</td>
                  <td className="py-3 pr-4 font-semibold">{formatMoney(r.amount_cents, settings.currency)}</td>
                  <td className="py-3 pr-4">{METHOD_LABEL[r.payment_method] ?? r.payment_method}</td>
                  <td className="py-3 pr-4">{FREQUENCY_LABEL[r.frequency]}</td>
                  <td className="py-3 pr-4">{r.designation}</td>
                  <td className="py-3 pr-4"><StatusBadge status={r.status} /></td>
                  <td className="py-3">
                    {r.receipt_number ? (
                      <a className="underline" href={`/receipts/${r.id}/pdf`}>
                        {r.receipt_number}<span className="sr-only">, download {isReceiptFinal(r.status as DonationStatus) ? "receipt" : "pending acknowledgment"}</span>
                      </a>
                    ) : <span className="text-ink-soft">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.pages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center gap-4">
              {result.page > 1 && <Link className="underline" href={qs(result.page - 1)}>Previous</Link>}
              <span>Page {result.page} of {result.pages}</span>
              {result.page < result.pages && <Link className="underline" href={qs(result.page + 1)}>Next</Link>}
            </nav>
          )}
        </div>
      )}
    </>
  );
}
