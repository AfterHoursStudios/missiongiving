import { NextResponse } from "next/server";
import { getStaffPermissions, getUser } from "@/lib/auth/session";
import { getOrgSettings } from "@/lib/settings";
import { loadDashboardData } from "@/lib/admin/dashboard-data";
import { SERIES_KEYS, buildSeries, defaultRange, parseRange, type SeriesKey } from "@/lib/admin/metrics";
import { toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ series: string }> }) {
  const { series } = await params;
  if (!(SERIES_KEYS as readonly string[]).includes(series)) return new NextResponse("Not found", { status: 404 });
  const user = await getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await getStaffPermissions(user.id)).has("reports.view")) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const settings = await getOrgSettings();
  const range = parseRange(url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined, defaultRange(new Date(), settings.timezone));
  const data = await loadDashboardData();
  const table = buildSeries(series as SeriesKey, { donations: data.donations, expenses: data.expenses, projects: data.projects, tz: settings.timezone, range });

  await audit(user.id, "report.export", "dashboard_series", series, { format: "csv", ...range, rows: table.rows.length });
  return new NextResponse(toCsv(table.columns, table.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${series}-${range.from}-to-${range.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
