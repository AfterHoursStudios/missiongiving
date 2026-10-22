import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { definitionSchema, restrictDefinition } from "@/lib/reports/builder/fields";
import { ReportBuilder, type SavedReport } from "@/components/admin/report-builder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Report builder" };

export default async function ReportBuilderPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const { user, perms } = await requirePermission("reports.view");
  const sp = await searchParams;
  const canViewDonors = perms.has("donors.view");
  // The reports this person saved, plus any a colleague shared.
  const res = await createSupabaseAdminClient().from("saved_reports").select("id, name, shared, created_by, definition")
    .or(`created_by.eq.${user.id},shared.eq.true`).order("name");
  const saved: SavedReport[] = (res.data ?? []).flatMap((r) => {
    const d = definitionSchema.safeParse(r.definition);
    return d.success ? [{ id: r.id, name: r.name, shared: r.shared, mine: r.created_by === user.id, definition: restrictDefinition(d.data, canViewDonors).def }] : [];
  });
  const initial = saved.find((s) => s.id === sp.report) ?? null;

  return (
    <>
      <h1 className="text-3xl font-semibold">Report builder</h1>
      <p className="mt-1 max-w-prose text-ink-soft">Build a list of gifts or donors with the columns, filters and totals you need, then export it or save it to run again.</p>
      {res.error && <p className="mt-3 rounded-md bg-warning-bg p-3 text-warning">Apply database migration 0024 (saved_reports) to save reports. You can still build, run and export them.</p>}
      <div className="mt-6">
        {/* key: opening another saved report starts the builder fresh with its settings. */}
        <ReportBuilder key={initial?.id ?? "new"} saved={saved} initial={initial} canViewDonors={canViewDonors} />
      </div>
    </>
  );
}
