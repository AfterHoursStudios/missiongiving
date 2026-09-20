import { NextResponse } from "next/server";
import { z } from "zod";
import { getStaffPermissions, getUser } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Redirects to a 60-second signed URL for the private receipt file. Requires finance/expense access; the bucket itself has no public access. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new NextResponse("Not found", { status: 404 });
  const user = await getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const perms = await getStaffPermissions(user.id);
  if (!perms.has("expenses.record") && !perms.has("finance.view")) return new NextResponse("Forbidden", { status: 403 });

  const db = createSupabaseAdminClient();
  const { data: e } = await db.from("expenses").select("receipt_path").eq("id", id).maybeSingle();
  if (!e?.receipt_path) return new NextResponse("Not found", { status: 404 });
  const { data } = await db.storage.from("expense-receipts").createSignedUrl(e.receipt_path, 60, { download: false });
  if (!data?.signedUrl) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
