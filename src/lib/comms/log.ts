import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type CommunicationKind = "receipt" | "thank_you" | "payment_failed" | "recurring_canceled" | "refund" | "message" | "logged";
export type CommunicationChannel = "email" | "mail" | "phone" | "in_person" | "other";

export interface CommunicationEntry {
  donorId: string; kind: CommunicationKind; channel?: CommunicationChannel; subject?: string | null; detail?: string | null;
  donationId?: string | null; templateKey?: string | null; status?: "sent" | "skipped" | "failed" | "logged"; createdBy?: string | null;
}

/**
 * Records one outgoing communication on the donor's Contacts tab. Best-effort: a logging failure never blocks or
 * fails the send it describes. Store subjects and short notes only, never message bodies or payment details.
 */
export async function logCommunication(e: CommunicationEntry): Promise<void> {
  try {
    await createSupabaseAdminClient().from("donor_communications").insert({
      donor_id: e.donorId, kind: e.kind, channel: e.channel ?? "email", subject: e.subject ?? null, detail: e.detail ?? null,
      donation_id: e.donationId ?? null, template_key: e.templateKey ?? null, status: e.status ?? "sent", created_by: e.createdBy ?? null,
    });
  } catch { /* best-effort */ }
}
