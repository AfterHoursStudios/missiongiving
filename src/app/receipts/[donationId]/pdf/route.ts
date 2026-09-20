import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgSettings } from "@/lib/settings";
import { renderReceiptPdf } from "@/lib/receipts/pdf";
import { STATUS_LABELS, isReceiptFinal, type DonationStatus } from "@/lib/donations/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ donationId: string }> }) {
  const { donationId } = await params;
  if (!z.string().uuid().safeParse(donationId).success) return new NextResponse("Not found", { status: 404 });
  if (!(await getUser())) return new NextResponse("Unauthorized", { status: 401 });

  // Row Level Security limits this to the caller's own donations (or staff with donor/finance permission).
  const supabase = await createSupabaseServerClient();
  const { data: d } = await supabase.from("donations")
    .select("amount_cents, currency, frequency, status, payment_method, donated_at, settled_at, project_id, donor_id, receipts(receipt_number, is_final)")
    .eq("id", donationId).maybeSingle();
  const receipt = Array.isArray(d?.receipts) ? d?.receipts[0] : d?.receipts;
  if (!d || !receipt) return new NextResponse("Not found", { status: 404 });

  const [{ data: donor }, { data: project }, org] = await Promise.all([
    supabase.from("donor_profiles").select("first_name, last_name").eq("id", d.donor_id).maybeSingle(),
    d.project_id ? supabase.from("projects").select("title").eq("id", d.project_id).maybeSingle() : Promise.resolve({ data: null }),
    getOrgSettings(),
  ]);

  const status = d.status as DonationStatus;
  const pdf = await renderReceiptPdf({
    receiptNumber: receipt.receipt_number, isFinal: receipt.is_final && isReceiptFinal(status), status: STATUS_LABELS[status],
    donorName: donor ? `${donor.first_name} ${donor.last_name}` : "Donor",
    date: new Date(d.settled_at ?? d.donated_at).toLocaleDateString("en-US"),
    amountCents: d.amount_cents, currency: d.currency, designation: project?.title ?? "General Fund",
    paymentMethod: d.payment_method, frequency: d.frequency.replace("_", " "),
    org: { legalName: org.legal_name, address: org.mailing_address, ein: org.ein, phone: org.phone, acknowledgment: org.tax_acknowledgment, noGoods: org.no_goods_or_services_statement },
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${receipt.receipt_number}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
