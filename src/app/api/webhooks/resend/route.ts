import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { mapResendEvent, shouldSuppress, verifySvixSignature } from "@/lib/comms/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResendPayload {
  type: string; created_at?: string;
  data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string } };
}

/**
 * Delivery tracking (delivered, bounced, complained, opened, clicked). The Svix signature is verified against the raw body.
 * Each webhook id is stored once (unique provider_event_id) so redeliveries are ignored. Permanent bounces and spam complaints
 * suppress the address so it is never mailed again.
 */
export async function POST(request: Request) {
  const secret = serverEnv().RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 400 });
  const body = await request.text();
  const id = request.headers.get("svix-id");
  const ok = verifySvixSignature({ secret, id, timestamp: request.headers.get("svix-timestamp"), signatureHeader: request.headers.get("svix-signature"), body });
  if (!ok) return NextResponse.json({ error: "invalid signature" }, { status: 400 });

  let payload: ResendPayload;
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const kind = mapResendEvent(payload.type);
  if (!kind || !id) return NextResponse.json({ ignored: true });

  try {
    const db = createSupabaseAdminClient();
    const messageId = payload.data?.email_id ?? null;
    const { data: rec } = messageId ? await db.from("campaign_recipients").select("id, donor_id").eq("provider_message_id", messageId).maybeSingle() : { data: null };
    const ins = await db.from("email_events").insert({ recipient_id: rec?.id ?? null, provider_message_id: messageId, event_type: kind, provider_event_id: id, occurred_at: payload.created_at ?? new Date().toISOString() });
    if (ins.error?.code === "23505") return NextResponse.json({ duplicate: true }); // already processed
    if (ins.error) throw new Error(ins.error.message);

    if (rec && (kind === "bounced" || kind === "complained")) await db.from("campaign_recipients").update({ status: kind }).eq("id", rec.id);

    const reason = shouldSuppress(kind, payload.data);
    const to = (Array.isArray(payload.data?.to) ? payload.data?.to[0] : payload.data?.to)?.trim().toLowerCase();
    if (reason && to) {
      await db.from("email_suppressions").upsert({ email: to, reason }, { onConflict: "email", ignoreDuplicates: true });
      const { data: donors } = await db.from("donor_profiles").select("id").eq("normalized_email", to);
      for (const d of donors ?? []) {
        await db.from("communication_preferences").upsert({ donor_id: d.id, suppressed: true, suppressed_reason: reason, updated_at: new Date().toISOString() }, { onConflict: "donor_id" });
      }
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[resend-webhook] failed", { id, type: payload.type, name: e instanceof Error ? e.name : "unknown" });
    return NextResponse.json({ error: "handler failed" }, { status: 500 }); // provider retries
  }
}
