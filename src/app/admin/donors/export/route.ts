import { NextResponse } from "next/server";
import { getStaffPermissions, getUser } from "@/lib/auth/session";
import { donorQuerySchema, queryDonors } from "@/lib/admin/donors";
import { toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Donor list export. Requires the dedicated `donors.export` permission (not implied by viewing). Contains no payment details. */
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const perms = await getStaffPermissions(user.id);
  if (!perms.has("donors.export") || !perms.has("donors.view")) return new NextResponse("Forbidden", { status: 403 });
  if (!rateLimit(`donor-export:${user.id}`, 5, 60 * 60_000).ok) return new NextResponse("Too many exports. Try again later.", { status: 429 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = donorQuerySchema.safeParse(params);
  if (!parsed.success) return new NextResponse("Bad request", { status: 400 });
  const { rows } = await queryDonors(parsed.data, { all: true });

  await audit(user.id, "donor.export", "donor_list", undefined, { rows: rows.length, filters: { ...parsed.data, q: parsed.data.q ? "[set]" : undefined } });
  const body = toCsv(
    ["First name", "Last name", "Email", "Phone", "Status", "Lifetime giving ($)", "Gifts", "First gift", "Last gift", "Active recurring gifts"],
    rows.map((d) => [d.first_name, d.last_name, d.email, d.phone, d.status, (d.lifetime_cents / 100).toFixed(2), d.gift_count, d.first_gift_at?.slice(0, 10), d.last_gift_at?.slice(0, 10), d.active_recurring]),
  );
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="donors.csv"', "Cache-Control": "private, no-store" },
  });
}
