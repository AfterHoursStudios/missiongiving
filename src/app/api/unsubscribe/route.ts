import { NextResponse } from "next/server";
import { applyUnsubscribe, readToken } from "@/lib/comms/unsubscribe";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** RFC 8058 one-click endpoint: mail clients POST here. A GET (a person clicking the link) is sent to the confirmation page instead. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`unsub:${ip}`, 60, 60_000).ok) return new NextResponse("Too many requests", { status: 429 });
  const token = new URL(request.url).searchParams.get("t");
  const who = readToken(token);
  if (!who) return new NextResponse("Invalid link", { status: 400 });
  const r = await applyUnsubscribe(who.donorId, who.campaignId);
  return new NextResponse(r.ok ? "Unsubscribed" : "Could not unsubscribe", { status: r.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  const t = new URL(request.url).searchParams.get("t") ?? "";
  return NextResponse.redirect(new URL(`/unsubscribe?t=${encodeURIComponent(t)}`, request.url), 303);
}
