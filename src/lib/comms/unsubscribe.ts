import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { verifyUnsubscribe } from "./security";

/** Verifies the signed token and returns who it names, or null. */
export function readToken(token: string | null | undefined) {
  const secret = serverEnv().UNSUBSCRIBE_SECRET;
  if (!secret || !token) return null;
  return verifyUnsubscribe(secret, token);
}

/**
 * Turns off all non-transactional email for the donor (news and project updates). Receipts and payment notices are unaffected.
 * Idempotent. Records an `unsubscribed` event against the campaign that produced the link, when known.
 */
export async function applyUnsubscribe(donorId: string, campaignId: string | null): Promise<{ ok: boolean }> {
  const db = createSupabaseAdminClient();
  const { data: donor } = await db.from("donor_profiles").select("id").eq("id", donorId).maybeSingle();
  if (!donor) return { ok: false };
  const { error } = await db.from("communication_preferences").upsert(
    { donor_id: donorId, marketing_email: false, project_updates: false, updated_at: new Date().toISOString() }, { onConflict: "donor_id" });
  if (error) return { ok: false };
  if (campaignId) {
    const { data: rec } = await db.from("campaign_recipients").select("id").eq("campaign_id", campaignId).eq("donor_id", donorId).maybeSingle();
    if (rec) {
      const { data: existing } = await db.from("email_events").select("id").eq("recipient_id", rec.id).eq("event_type", "unsubscribed").maybeSingle();
      if (!existing) await db.from("email_events").insert({ recipient_id: rec.id, event_type: "unsubscribed" });
    }
  }
  return { ok: true };
}
