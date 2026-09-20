import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { getDonorContext } from "@/lib/donor/context";

export const dynamic = "force-dynamic";

/** "Download a copy of my personal data". Every query is user-scoped, so RLS limits it to the caller's own records. */
export async function GET() {
  if (!(await getUser())) return new NextResponse("Unauthorized", { status: 401 });
  const { supabase, donor, user } = await getDonorContext();
  if (!donor) return new NextResponse("Not found", { status: 404 });

  const [donations, recurring, prefs, dedications] = await Promise.all([
    supabase.from("donations").select("id, amount_cents, refunded_cents, currency, frequency, payment_method, status, donated_at, settled_at, anonymous, donor_note, projects(title), receipts(receipt_number)").eq("donor_id", donor.id),
    supabase.from("recurring_donations").select("id, amount_cents, currency, frequency, status, next_charge_at, canceled_at, created_at").eq("donor_id", donor.id),
    supabase.from("communication_preferences").select("marketing_email, project_updates, annual_statement_email, updated_at").eq("donor_id", donor.id).maybeSingle(),
    supabase.from("dedications").select("kind, name, message, donation_id"),
  ]);

  const body = JSON.stringify({
    exported_at: new Date().toISOString(),
    account: { email: user.email },
    profile: donor,
    donations: donations.data ?? [], recurring_donations: recurring.data ?? [],
    communication_preferences: prefs.data, dedications: dedications.data ?? [],
    note: "Payment card and bank numbers are never stored by Mission Giving.",
  }, null, 2);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="my-mission-giving-data.json"',
      "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex",
    },
  });
}
