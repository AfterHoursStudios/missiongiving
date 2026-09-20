import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_EVENT_DAYS = 90;

/**
 * Data-retention job. Removes only operational bookkeeping that has no accounting value: processed/ignored Stripe webhook
 * records older than 90 days. It NEVER touches donations, receipts, refunds, expenses, audit logs or campaign records:
 * financial and audit records are retained under the organization's retention policy and cannot be purged by this job.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  const cutoff = new Date(Date.now() - WEBHOOK_EVENT_DAYS * 86_400_000).toISOString();
  const { count, error } = await createSupabaseAdminClient().from("webhook_events")
    .delete({ count: "exact" }).in("status", ["processed", "ignored"]).lt("received_at", cutoff);
  if (error) return NextResponse.json({ error: "retention run failed" }, { status: 500 });
  return NextResponse.json({ webhookEventsPurged: count ?? 0 });
}
