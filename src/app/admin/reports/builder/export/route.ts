import { NextResponse } from "next/server";
import { getStaffPermissions, getUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { toCsv } from "@/lib/csv";
import { writeXlsx, type Cell } from "@/lib/xlsx";
import { loadBuilderRows } from "@/lib/reports/builder/data";
import { displayValue, runDefinition, type Value } from "@/lib/reports/builder/engine";
import { definitionSchema, fieldOf, restrictDefinition, SOURCES, type FieldDef } from "@/lib/reports/builder/fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Report builder export: ?def=<base64url JSON definition>&format=csv|xlsx&name=… Every matching row, with group subtotals and a grand total. */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const perms = await getStaffPermissions(user.id);
  if (!perms.has("reports.view")) return new NextResponse("Forbidden", { status: 403 });
  if (!rateLimit(`builder-export:${user.id}`, 30, 60 * 60_000).ok) return new NextResponse("Too many exports. Try again later.", { status: 429 });

  const url = new URL(request.url);
  let raw: unknown;
  try { raw = JSON.parse(Buffer.from(url.searchParams.get("def") ?? "", "base64url").toString("utf8")); } catch { return new NextResponse("Bad report definition", { status: 400 }); }
  const parsed = definitionSchema.safeParse(raw);
  if (!parsed.success) return new NextResponse("Bad report definition", { status: 400 });
  const canViewDonors = perms.has("donors.view");
  const { def } = restrictDefinition(parsed.data, canViewDonors);
  if (def.columns.length === 0) return new NextResponse("No columns", { status: 400 });
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const title = (url.searchParams.get("name") || `${SOURCES[def.source].label} report`).slice(0, 120);

  const { rows, today } = await loadBuilderRows(def.source, canViewDonors);
  const r = runDefinition(rows, def, { today });
  await audit(user.id, "report.export", "report_builder", def.source, { format, columns: def.columns, filters: def.filters.map((f) => `${f.field} ${f.op}`), rows: r.count });

  const fields: FieldDef[] = r.columns.map((c) => fieldOf(def.source, c.key)!);
  const groupLabel = def.groupBy ? fieldOf(def.source, def.groupBy)?.label : undefined;
  const countLabel = (label: string, count: number) => `${label} (${count.toLocaleString("en-US")} ${count === 1 ? "row" : "rows"})`;
  const file = `${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "report"}-${today}`;

  if (format === "csv") {
    // Money is a plain number in dollars so spreadsheets can total it; everything else as shown on screen.
    const out = (f: FieldDef, v: Value) => (f.type === "money" && typeof v === "number" ? (v / 100).toFixed(2) : displayValue(f, v));
    const totalRow = (label: string, count: number, totals: (number | null)[]) => fields.map((f, i) => (totals[i] !== null ? out(f, totals[i]) : i === 0 ? countLabel(label, count) : ""));
    const lines: unknown[][] = [];
    for (const s of r.sections) {
      if (s.label !== null) lines.push([`${groupLabel}: ${s.label}`]);
      for (const row of s.rows) lines.push(row.map((v, i) => out(fields[i], v)));
      if (s.label !== null) lines.push(totalRow(`Subtotal ${s.label}`, s.count, s.totals));
    }
    lines.push(totalRow("Total", r.count, r.totals));
    return new NextResponse(toCsv(fields.map((f) => f.label), lines), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"`, "Cache-Control": "private, no-store" },
    });
  }

  const xcell = (f: FieldDef, v: Value, bold = false): Cell => {
    if (v === null || v === "") return null;
    if (f.type === "money" && typeof v === "number") return { v: v / 100, s: bold ? "moneyBold" : "money" };
    if (f.type === "number" && typeof v === "number") return { v, s: bold ? "bold" : "text" };
    return { v: displayValue(f, v), s: bold ? "bold" : "text" };
  };
  const totalRow = (label: string, count: number, totals: (number | null)[]): Cell[] =>
    fields.map((f, i) => (totals[i] !== null ? xcell(f, totals[i], true) : i === 0 ? { v: countLabel(label, count), s: "bold" } : null));
  const sheet: Cell[][] = [[{ v: title, s: "title" }], [`Generated ${today} · ${r.count.toLocaleString("en-US")} rows`], [], fields.map((f) => ({ v: f.label, s: "header" }))];
  for (const s of r.sections) {
    if (s.label !== null) sheet.push([{ v: `${groupLabel}: ${s.label}`, s: "bold" }]);
    for (const row of s.rows) sheet.push(row.map((v, i) => xcell(fields[i], v)));
    if (s.label !== null) sheet.push(totalRow(`Subtotal ${s.label}`, s.count, s.totals));
  }
  sheet.push(totalRow("Total", r.count, r.totals));
  const xlsx = writeXlsx([{ name: "Report", rows: sheet, widths: fields.map((f) => (f.type === "text" ? 26 : 16)), freezeRows: 4 }]);
  return new NextResponse(new Uint8Array(xlsx), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${file}.xlsx"`, "Cache-Control": "private, no-store" },
  });
}
