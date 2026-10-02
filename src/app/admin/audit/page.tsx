import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit log" };
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string; page?: string }> }) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const db = createSupabaseAdminClient();
  let q = db.from("audit_logs").select("id, actor_id, action, entity_type, entity_id, details, created_at", { count: "exact" }).order("id", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  if (sp.action && /^[a-z_.]+$/.test(sp.action)) q = q.eq("action", sp.action);
  const entity = sp.entity && /^[0-9a-f-]{36}$/i.test(sp.entity) ? sp.entity : undefined; // e.g. one donor's history, linked from their record
  if (entity) q = q.eq("entity_id", entity);
  const [{ data, count }, { data: profiles }, { data: actions }] = await Promise.all([q, db.from("profiles").select("id, email"), db.from("audit_logs").select("action").limit(1000)]);
  const email = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const kinds = [...new Set((actions ?? []).map((a) => a.action))].sort();
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const href = (p: number) => `?${new URLSearchParams({ ...(sp.action ? { action: sp.action } : {}), ...(entity ? { entity } : {}), page: String(p) })}`;

  return (
    <>
      <h1 className="text-3xl font-semibold">Audit log</h1>
      <p className="mt-2 text-ink-soft">Append-only. Entries cannot be edited or deleted through the application.</p>
      {entity && <p className="mt-2">Showing entries for record <code>{entity.slice(0, 8)}</code> only. <Link className="underline" href="/admin/audit">Show all</Link></p>}
      <form method="get" className="mt-4 flex items-end gap-3">
        {entity && <input type="hidden" name="entity" value={entity} />}
        <div><label htmlFor="action" className="block text-sm font-semibold">Action</label>
          <select id="action" name="action" defaultValue={sp.action ?? ""} className="min-h-11 rounded-md border border-ink-soft bg-white px-2"><option value="">All</option>{kinds.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
        <button className="min-h-11 rounded-md bg-teal-800 px-5 font-semibold text-white">Filter</button>
      </form>
      <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[48rem] text-left text-sm">
        <caption className="sr-only">Audit log entries</caption>
        <thead><tr className="border-b-2 border-ink">{["When", "Who", "Action", "Target", "Details"].map((h) => <th key={h} scope="col" className="py-2 pr-4">{h}</th>)}</tr></thead>
        <tbody>{(data ?? []).map((e) => (
          <tr key={e.id} className="border-b border-line align-top">
            <td className="py-2 pr-4 whitespace-nowrap">{new Date(e.created_at).toLocaleString("en-US")}</td>
            <td className="py-2 pr-4">{e.actor_id ? email.get(e.actor_id) ?? e.actor_id : "system"}</td>
            <td className="py-2 pr-4 font-semibold">{e.action}</td>
            <td className="py-2 pr-4">{e.entity_type}{e.entity_id ? ` · ${String(e.entity_id).slice(0, 8)}` : ""}</td>
            <td className="py-2"><code className="break-all">{JSON.stringify(e.details)}</code></td>
          </tr>))}
          {(data ?? []).length === 0 && <tr><td colSpan={5} className="py-8 text-center text-ink-soft">No entries.</td></tr>}
        </tbody></table></div>
      {pages > 1 && <nav aria-label="Pagination" className="mt-4 flex items-center gap-4">
        {page > 1 && <Link className="underline" href={href(page - 1)}>Newer</Link>}<span>Page {page} of {pages}</span>{page < pages && <Link className="underline" href={href(page + 1)}>Older</Link>}</nav>}
    </>
  );
}
