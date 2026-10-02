import { NextResponse } from "next/server";
import { designationLabel } from "@/lib/donations/designation";
import { z } from "zod";
import { getUser } from "@/lib/auth/session";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgSettings } from "@/lib/settings";
import { renderReceiptPdf } from "@/lib/receipts/pdf";
import { STATUS_LABELS, isReceiptFinal, type DonationStatus } from "@/lib/donations/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ donationId: string }> }) {
  const { donationId } = await params;
  if (!z.string().uuid().safeParse(donationId).success) return new NextResponse("Not found", { status: 404 });
  const user = await getUser();

  // Signed in: Row Level Security limits this to the caller's own donations (or staff with donor/finance permission).
  // A guest has no session for RLS to check, so this receipt's own unguessable id is what stands in for a link —
  // but only while nobody has claimed that donor record with an account. Once they do, they're expected to sign in
  // and use their dashboard instead, same as any other account holder.
  const supabase = user ? await createSupabaseServerClient() : createSupabaseAdminClient();
  const { data: d } = await supabase.from("donations")
    .select("amount_cents, currency, frequency, status, payment_method, donated_at, settled_at, project_id, donor_id, receipts(receipt_number, is_final)")
    .eq("id", donationId).maybeSingle();
  const receipt = Array.isArray(d?.receipts) ? d?.receipts[0] : d?.receipts;
  if (!d || !receipt) return new NextResponse("Not found", { status: 404 });

  if (!user) {
    const { data: donorRow } = await supabase.from("donor_profiles").select("user_id").eq("id", d.donor_id).maybeSingle();
    if (donorRow?.user_id) return new NextResponse("Unauthorized. Please sign in to download this receipt.", { status: 401 });
  }

  const [{ data: donor }, designation, org] = await Promise.all([
    supabase.from("donor_profiles").select("first_name, last_name").eq("id", d.donor_id).maybeSingle(),
    designationLabel(d.project_id),
    getOrgSettings(),
  ]);

  const status = d.status as DonationStatus;
  const pdf = await renderReceiptPdf({
    receiptNumber: receipt.receipt_number, isFinal: receipt.is_final && isReceiptFinal(status), status: STATUS_LABELS[status],
    donorName: donor ? `${donor.first_name} ${donor.last_name}` : "Donor",
    date: new Date(d.settled_at ?? d.donated_at).toLocaleDateString("en-US"),
    amountCents: d.amount_cents, currency: d.currency, designation,
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
