import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { runDueCampaigns } from "@/lib/comms/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = serverEnv().CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(given), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Vercel Cron (or any scheduler) calls this with `Authorization: Bearer $CRON_SECRET`. Sends due campaigns in throttled batches. */
export async function GET(request: Request) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    return NextResponse.json(await runDueCampaigns());
  } catch (e) {
    console.error("[cron] campaign run failed", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "run failed" }, { status: 500 });
  }
}
