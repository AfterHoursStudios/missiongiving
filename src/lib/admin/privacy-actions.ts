"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import type { AdminState } from "./donor-actions";

/** Approves a deletion request: personal data is removed, financial records are retained (see anonymize_donor). */
export async function completeDeletion(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("donors.edit");
  const p = z.object({ requestId: z.string().uuid(), confirm: z.literal("ANONYMIZE") }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Type ANONYMIZE to confirm." };
  const db = createSupabaseAdminClient();
  const { data: req } = await db.from("data_requests").select("id, donor_id, kind, status").eq("id", p.data.requestId).maybeSingle();
  if (!req || req.kind !== "deletion" || !["open", "in_progress"].includes(req.status)) return { error: "This request is not open." };

  const { data, error } = await db.rpc("anonymize_donor", { p_donor: req.donor_id });
  if (error) {
    if (/active_recurring/.test(error.message)) return { error: "This donor still has an active recurring gift. Ask them to cancel it (or cancel it in Stripe) first." };
    return { error: "Anonymization failed. Nothing was changed." };
  }
  await db.from("data_requests").update({ resolved_by: user.id }).eq("id", req.id);
  // Remove the login so the person can no longer sign in with the deleted identity.
  const authUserId = (data as { auth_user_id?: string } | null)?.auth_user_id;
  let loginRemoved = true;
  if (authUserId) { const { error: delErr } = await db.auth.admin.deleteUser(authUserId); loginRemoved = !delErr; }
  await audit(user.id, "donor.update", "donor", req.donor_id, { field: "anonymized", request: req.id, login_removed: loginRemoved });
  revalidatePath("/admin/privacy");
  return { ok: true, message: loginRemoved ? "Donor anonymized and login removed. Financial records were retained." : "Donor anonymized, but the login could not be removed. Remove it in Supabase Auth." };
}

export async function rejectDeletion(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("donors.edit");
  const p = z.object({ requestId: z.string().uuid(), note: z.string().trim().min(3, "Give a reason").max(500) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await createSupabaseAdminClient().from("data_requests")
    .update({ status: "rejected", note: p.data.note, resolved_at: new Date().toISOString(), resolved_by: user.id }).eq("id", p.data.requestId).in("status", ["open", "in_progress"]);
  if (error) return { error: "Could not update the request." };
  await audit(user.id, "donor.update", "data_request", p.data.requestId, { field: "deletion_rejected" });
  revalidatePath("/admin/privacy");
  return { ok: true, message: "Request closed." };
}
