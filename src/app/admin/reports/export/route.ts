import { NextResponse } from "next/server";
import { getStaffPermissions, getUser } from "@/lib/auth/session";
import { runReport } from "@/lib/reports/request";
import { sectionsToCsv } from "@/lib/reports/sections";
import { renderReportPdf } from "@/lib/reports/pdf";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const perms = await getStaffPermissions(user.id);
  if (!perms.has("reports.view")) return new NextResponse("Forbidden", { status: 403 });
  if (!rateLimit(`report-export:${user.id}`, 30, 60 * 60_000).ok) return new NextResponse("Too many exports. Try again later.", { status: 429 });

  const sp = Object.fromEntries(new URL(request.url).searchParams) as Record<string, string | undefined>;
  const format = sp.format === "pdf" ? "pdf" : "csv";
  const r = await runReport(sp, perms);
  const generatedAt = new Date().toLocaleString("en-US", { timeZone: r.settings.timezone, dateStyle: "long", timeStyle: "short" });

  // Filters are recorded so an export can be traced; donor identity is not (only whether a donor filter was used).
  await audit(user.id, "report.export", "financial_report", r.type, { format, ...r.filters, donorId: r.filters.donorId ? "[set]" : undefined });

  const name = `${r.type === "soa" ? "statement-of-activities" : "management-pl"}-${r.filters.from}-to-${r.filters.to}`;
  if (format === "csv") {
    const csv = sectionsToCsv(r.sections, [r.title, r.settings.legal_name, ...r.filterLines, `Generated: ${generatedAt}`, "Internal management report; accountant review recommended."]);
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "private, no-store" } });
  }
  const pdf = await renderReportPdf({ orgName: r.settings.legal_name, title: r.title, filters: r.filterLines, generatedAt, currency: r.settings.currency }, r.sections);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
}
