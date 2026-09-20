import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { getDonorContext } from "@/lib/donor/context";
import { loadStatementRows } from "@/lib/donor/statement-data";
import { getOrgSettings } from "@/lib/settings";
import { buildStatement } from "@/lib/statements";
import { renderStatementPdf } from "@/lib/statements-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ year: string }> }) {
  const year = z.coerce.number().int().min(2000).max(2100).safeParse((await params).year);
  if (!year.success) return new NextResponse("Not found", { status: 404 });
  if (!(await getUser())) return new NextResponse("Unauthorized", { status: 401 });

  const { donor, supabase } = await getDonorContext();
  if (!donor) return new NextResponse("Not found", { status: 404 });
  const org = await getOrgSettings();
  // Rows come from the user-scoped client, so the statement can only ever contain this donor's gifts.
  const statement = buildStatement(await loadStatementRows(), year.data, org.timezone);
  if (statement.lines.length === 0) return new NextResponse("No settled gifts in that year", { status: 404 });

  const pdf = await renderStatementPdf(statement, `${donor.first_name} ${donor.last_name}`, org.currency, {
    legalName: org.legal_name, address: org.mailing_address, ein: org.ein, phone: org.phone,
    acknowledgment: org.tax_acknowledgment, noGoods: org.no_goods_or_services_statement,
  }, org.timezone);

  // Record that a statement was generated (own row only; RLS enforced).
  await supabase.from("annual_statements").upsert(
    { donor_id: donor.id, year: year.data, total_cents: statement.totalCents, generated_at: new Date().toISOString() },
    { onConflict: "donor_id,year" });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="giving-statement-${year.data}.pdf"`,
      "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex",
    },
  });
}
