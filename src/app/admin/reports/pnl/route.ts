import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getOrgSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { loadReportData } from "@/lib/reports/data";
import { buildPnl } from "@/lib/reports/pnl";
import { pnlWorkbook } from "@/lib/reports/pnl-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Monthly P&L as an Excel file: /admin/reports/pnl?month=YYYY-MM (defaults to the current month). */
export async function GET(request: Request) {
  const { user } = await requirePermission("reports.view");
  const settings = await getOrgSettings();
  const param = new URL(request.url).searchParams.get("month") ?? "";
  const now = new Date().toLocaleDateString("en-CA", { timeZone: settings.timezone }).slice(0, 7);
  const [y, m] = (/^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : now).split("-").map(Number);

  const [data, { data: sponsorships }] = await Promise.all([
    loadReportData(),
    createSupabaseAdminClient().from("projects").select("id").eq("kind", "sponsorship"),
  ]);
  const pnl = buildPnl({
    donations: data.donations, expenses: data.expenses, sponsorshipProjectIds: new Set((sponsorships ?? []).map((p) => p.id as string)),
    year: y, month: m, timeZone: settings.timezone,
  });
  const file = pnlWorkbook(pnl, settings.brand_name || "Mission Giving");
  await audit(user.id, "report.export", "financial_report", "pnl", { month: `${y}-${String(m).padStart(2, "0")}`, format: "xlsx" });

  return new NextResponse(Buffer.from(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="PnL-${y}-${String(m).padStart(2, "0")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
