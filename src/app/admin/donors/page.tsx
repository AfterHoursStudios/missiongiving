import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { DONOR_PAGE_SIZE, donorQuerySchema, queryDonors } from "@/lib/admin/donors";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Donors" };

const sel = "min-h-11 rounded-md border border-ink-soft bg-white px-2";

export default async function DonorsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { perms } = await requirePermission("donors.view");
  const raw = await searchParams;
  const parsed = donorQuerySchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v)));
  const query = parsed.success ? parsed.data : donorQuerySchema.parse({});
  const [{ rows, total }, { data: tags }] = await Promise.all([queryDonors(query), createSupabaseAdminClient().from("donor_tags").select("id, name").order("name")]);
  const pages = Math.max(1, Math.ceil(total / DONOR_PAGE_SIZE));
  const link = (over: Record<string, string | number>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...query, ...over })) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) p.set(k, String(v));
    return `?${p}`;
  };
  const exportQs = new URLSearchParams(Object.entries(query).filter(([k, v]) => v !== undefined && v !== "" && k !== "page").map(([k, v]) => [k, String(v)]));
  const sortLink = (key: string) => link({ sort: key, dir: query.sort === key && query.dir === "asc" ? "desc" : "asc", page: 1 });
  const ariaSort = (key: string) => (query.sort === key ? (query.dir === "asc" ? "ascending" : "descending") : "none");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Donors</h1>
        <div className="flex gap-4">
          {perms.has("donors.edit") && <Link className="underline" href="/admin/donors/duplicates">Find duplicates</Link>}
          {perms.has("donors.export") && <a className="underline" href={`/admin/donors/export?${exportQs}`}>Export CSV</a>}
        </div>
      </div>

      <form method="get" role="search" aria-label="Filter donors" className="mt-6 flex flex-wrap items-end gap-3">
        <div><label htmlFor="q" className="block text-sm font-semibold">Search</label><input id="q" name="q" defaultValue={query.q} placeholder="Name or email" className={sel + " w-56"} /></div>
        <div><label htmlFor="status" className="block text-sm font-semibold">Status</label>
          <select id="status" name="status" defaultValue={query.status ?? ""} className={sel}><option value="">Any</option>{["active", "inactive", "lapsed", "do_not_contact"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></div>
        <div><label htmlFor="tag" className="block text-sm font-semibold">Tag</label>
          <select id="tag" name="tag" defaultValue={query.tag ?? ""} className={sel}><option value="">Any</option>{(tags ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label htmlFor="recurring" className="block text-sm font-semibold">Recurring</label>
          <select id="recurring" name="recurring" defaultValue={query.recurring ?? ""} className={sel}><option value="">Any</option><option value="yes">Has active</option><option value="no">None</option></select></div>
        <div><label htmlFor="min" className="block text-sm font-semibold">Lifetime at least ($)</label><input id="min" name="min" inputMode="decimal" defaultValue={query.min} className={sel + " w-28"} /></div>
        <button className="min-h-11 rounded-md bg-teal-800 px-5 font-semibold text-white">Apply</button>
        <Link href="/admin/donors" className="min-h-11 py-2 underline">Clear</Link>
      </form>

      <p className="mt-4 text-sm text-ink-soft" role="status">{total} donor{total === 1 ? "" : "s"}</p>
      {rows.length === 0 ? <p className="mt-6 border-y border-line py-10 text-center text-ink-soft">No donors match.</p> : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left">
            <caption className="sr-only">Donors</caption>
            <thead><tr className="border-b-2 border-ink">
              <th scope="col" aria-sort={ariaSort("name")} className="py-2 pr-4"><Link className="underline" href={sortLink("name")}>Name</Link></th>
              <th scope="col" className="py-2 pr-4">Status</th>
              <th scope="col" aria-sort={ariaSort("lifetime")} className="py-2 pr-4"><Link className="underline" href={sortLink("lifetime")}>Lifetime</Link></th>
              <th scope="col" className="py-2 pr-4">Gifts</th>
              <th scope="col" aria-sort={ariaSort("last_gift")} className="py-2 pr-4"><Link className="underline" href={sortLink("last_gift")}>Last gift</Link></th>
              <th scope="col" className="py-2">Recurring</th>
            </tr></thead>
            <tbody>{rows.map((d) => (
              <tr key={d.id} className="border-b border-line">
                <td className="py-3 pr-4"><Link className="font-semibold underline" href={`/admin/donors/${d.id}`}>{d.last_name}, {d.first_name}</Link><br /><span className="text-sm text-ink-soft">{d.email}</span></td>
                <td className="py-3 pr-4">{d.status.replace("_", " ")}</td>
                <td className="py-3 pr-4 font-semibold">{formatMoney(d.lifetime_cents)}</td>
                <td className="py-3 pr-4">{d.gift_count}</td>
                <td className="py-3 pr-4">{d.last_gift_at ? new Date(d.last_gift_at).toLocaleDateString("en-US") : "—"}</td>
                <td className="py-3">{d.active_recurring > 0 ? `${d.active_recurring} active` : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center gap-4">
          {query.page > 1 && <Link className="underline" href={link({ page: query.page - 1 })}>Previous</Link>}
          <span>Page {query.page} of {pages}</span>
          {query.page < pages && <Link className="underline" href={link({ page: query.page + 1 })}>Next</Link>}
        </nav>
      )}
    </>
  );
}
