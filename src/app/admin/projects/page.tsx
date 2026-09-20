import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { syncGoalStatuses } from "@/lib/admin/project-actions";
import { formatMoney, projectProgress } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

export default async function ProjectsAdminPage() {
  await requirePermission("projects.manage");
  await syncGoalStatuses();
  const db = createSupabaseAdminClient();
  const { data } = await db.from("projects").select("id, title, slug, status, is_public, featured, goal_cents, offline_adjustment_cents, end_date").order("created_at", { ascending: false });
  const rows = await Promise.all((data ?? []).map(async (p) => {
    const { data: t } = await db.rpc("project_totals", { p_project_id: p.id });
    return { ...p, raised: Number(t?.[0]?.raised_cents ?? 0), donors: Number(t?.[0]?.donor_count ?? 0) };
  }));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Projects</h1>
        <Link href="/admin/projects/new" className="min-h-11 rounded-md bg-brand-700 px-5 py-2.5 font-semibold text-white">New project</Link>
      </div>
      {rows.length === 0 ? <p className="mt-8 border-y border-line py-10 text-center text-ink-soft">No projects yet.</p> : (
        <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[42rem] text-left">
          <caption className="sr-only">Projects</caption>
          <thead><tr className="border-b-2 border-ink">{["Project", "Status", "Raised", "Goal", "Donors", "Ends"].map((h) => <th key={h} scope="col" className="py-2 pr-4">{h}</th>)}</tr></thead>
          <tbody>{rows.map((p) => {
            const pr = projectProgress(p.raised, p.offline_adjustment_cents, p.goal_cents);
            return (
              <tr key={p.id} className="border-b border-line">
                <td className="py-3 pr-4"><Link className="font-semibold underline" href={`/admin/projects/${p.id}`}>{p.title}</Link>{p.is_public ? "" : <span className="ml-2 text-sm text-ink-soft">(not public)</span>}</td>
                <td className="py-3 pr-4">{p.status.replace("_", " ")}</td>
                <td className="py-3 pr-4 font-semibold">{formatMoney(pr.raised)}{pr.pct !== null && <span className="ml-1 text-sm font-normal text-ink-soft">({pr.pct}%)</span>}</td>
                <td className="py-3 pr-4">{p.goal_cents ? formatMoney(p.goal_cents) : "—"}</td>
                <td className="py-3 pr-4">{p.donors}</td>
                <td className="py-3">{p.end_date ?? "—"}</td>
              </tr>);
          })}</tbody></table></div>
      )}
    </>
  );
}
