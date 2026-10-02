import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { syncRecentStripeEvents } from "@/lib/stripe/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron calls this every 15 minutes with `Authorization: Bearer $CRON_SECRET`. A safety net behind the Stripe
 * webhook: replays the last two days of payment events so no gift stays "pending" if a webhook was missed.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    return NextResponse.json(await syncRecentStripeEvents({ days: 2 }));
  } catch (e) {
    console.error("[cron] stripe-sync failed", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "run failed" }, { status: 500 });
  }
}
