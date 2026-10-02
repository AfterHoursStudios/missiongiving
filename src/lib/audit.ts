import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type AuditAction =
  | "staff.login" | "permissions.change" | "donor.create" | "donor.update" | "donor.merge" | "donor.delete" | "refund.issue"
  | "expense.create" | "expense.update" | "project.publish" | "campaign.send"
  | "report.export" | "settings.change" | "financial.adjustment" | "donor.export"
  | "tier.change" | "receipt.resend" | "webhook.retry" | "sponsorship.change" | "form_template.change" | "message.send";

/** Append-only. Never pass secrets or payment details in `details`. */
export async function audit(
  actorId: string | null, action: AuditAction, entityType?: string, entityId?: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await createSupabaseAdminClient().from("audit_logs").insert({
    actor_id: actorId, action, entity_type: entityType, entity_id: entityId, details,
  });
  if (error) throw new Error(`audit log write failed: ${error.message}`);
}
