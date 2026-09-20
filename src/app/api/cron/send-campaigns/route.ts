import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { runDueCampaigns } from "@/lib/comms/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron (or any scheduler) calls this with `Authorization: Bearer $CRON_SECRET`. Sends due campaigns in throttled batches. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    return NextResponse.json(await runDueCampaigns());
  } catch (e) {
    console.error("[cron] campaign run failed", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "run failed" }, { status: 500 });
  }
}
