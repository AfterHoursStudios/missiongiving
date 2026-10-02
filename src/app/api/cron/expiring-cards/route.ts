import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { runExpiringCardsCheck } from "@/lib/admin/expiring-cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron calls this daily with `Authorization: Bearer $CRON_SECRET`. Digests soon-to-expire recurring-donor cards to the org contact address. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    return NextResponse.json(await runExpiringCardsCheck());
  } catch (e) {
    console.error("[cron] expiring-cards run failed", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "run failed" }, { status: 500 });
  }
}
