"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { notifyDonor } from "@/lib/donations/notify";

export type AdminState = { ok?: boolean; error?: string; message?: string } | undefined;
const uuid = z.string().uuid();

async function donorExists(id: string) {
  const { data } = await createSupabaseAdminClient().from("donor_profiles").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  return !!data;
}

export async function addNote(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("donors.edit");
  const p = z.object({ id: uuid, body: z.string().trim().min(1, "Enter a note").max(4000) }).safeParse({ id: form.get("id"), body: form.get("body") });
  if (!p.success) return { error: p.error.issues[0].message };
  if (!(await donorExists(p.data.id))) return { error: "Donor not found." };
  const { error } = await createSupabaseAdminClient().from("donor_notes").insert({ donor_id: p.data.id, body: p.data.body, created_by: user.id });
  if (error) return { error: "Could not save the note." };
  await audit(user.id, "donor.update", "donor", p.data.id, { field: "note_added" });
  revalidatePath(`/admin/donors/${p.data.id}`);
  return { ok: true, message: "Note added." };
}

const editSchema = z.object({
  id: uuid,
  first_name: z.string().trim().min(1).max(80), last_name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional(), organization_name: z.string().trim().max(120).optional(),
  address_line1: z.string().trim().max(120).optional(), address_line2: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(), region: z.string().trim().max(80).optional(), postal_code: z.string().trim().max(20).optional(),
  status: z.enum(["active", "inactive", "lapsed", "do_not_contact"]),
});

/** Nonfinancial corrections only. Email, Stripe ids, amounts and statuses of gifts are not editable here. */
export async function updateDonor(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("donors.edit");
  const p = editSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const { id, ...v } = p.data;
  const db = createSupabaseAdminClient();
  const { data: before } = await db.from("donor_profiles").select("first_name, last_name, phone, organization_name, address_line1, address_line2, city, region, postal_code, status").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!before) return { error: "Donor not found." };
  const next = { ...v, phone: v.phone || null, organization_name: v.organization_name || null, address_line1: v.address_line1 || null, address_line2: v.address_line2 || null, city: v.city || null, region: v.region || null, postal_code: v.postal_code || null };
  const { error } = await db.from("donor_profiles").update(next).eq("id", id);
  if (error) return { error: "Could not save changes." };
  const changed = Object.keys(next).filter((k) => (before as Record<string, unknown>)[k] !== (next as Record<string, unknown>)[k]);
  await audit(user.id, "donor.update", "donor", id, { changed_fields: changed }); // field names only, not values
  revalidatePath(`/admin/donors/${id}`);
  return { ok: true, message: "Donor updated." };
}

export async function setTag(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("donors.edit");
  const p = z.object({ id: uuid, tagId: uuid.optional(), newTag: z.string().trim().max(40).optional(), op: z.enum(["add", "remove"]) })
    .safeParse({ id: form.get("id"), tagId: form.get("tagId") || undefined, newTag: form.get("newTag") || undefined, op: form.get("op") });
  if (!p.success) return { error: "Choose or enter a tag." };
  if (!(await donorExists(p.data.id))) return { error: "Donor not found." };
  const db = createSupabaseAdminClient();
  let tagId = p.data.tagId;
  if (!tagId && p.data.newTag) {
    const { data } = await db.from("donor_tags").upsert({ name: p.data.newTag }, { onConflict: "name" }).select("id").single();
    tagId = data?.id;
  }
  if (!tagId) return { error: "Choose or enter a tag." };
  if (p.data.op === "add") await db.from("donor_tag_assignments").upsert({ donor_id: p.data.id, tag_id: tagId });
  else await db.from("donor_tag_assignments").delete().eq("donor_id", p.data.id).eq("tag_id", tagId);
  await audit(user.id, "donor.update", "donor", p.data.id, { field: "tags", op: p.data.op });
  revalidatePath(`/admin/donors/${p.data.id}`);
  return { ok: true, message: p.data.op === "add" ? "Tag added." : "Tag removed." };
}

export async function mergeDonors(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("donors.edit");
  const p = z.object({ primary: uuid, secondary: uuid, confirm: z.literal("MERGE") }).safeParse({
    primary: form.get("primary"), secondary: form.get("secondary"), confirm: form.get("confirm"),
  });
  if (!p.success) return { error: "Select two different records and type MERGE to confirm." };
  if (p.data.primary === p.data.secondary) return { error: "Choose two different records." };
  const { data, error } = await createSupabaseAdminClient().rpc("merge_donors", { p_primary: p.data.primary, p_secondary: p.data.secondary });
  if (error) return { error: "The merge could not be completed. Nothing was changed." }; // function is transactional
  await audit(user.id, "donor.merge", "donor", p.data.primary, { merged_from: p.data.secondary, ...data });
  revalidatePath("/admin/donors");
  return { ok: true, message: `Merged. ${data?.donations_moved ?? 0} donations and ${data?.recurring_moved ?? 0} recurring gifts moved. The old record is kept, marked as merged.` };
}

/** Re-sends the acknowledgment email for a settled donation and records the delivery in the receipt history. */
export async function resendReceipt(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("donors.edit");
  const id = uuid.safeParse(form.get("donationId"));
  if (!id.success) return { error: "Donation not found." };
  const db = createSupabaseAdminClient();
  const { data: d } = await db.from("donations").select("id, donor_id, status, payment_method").eq("id", id.data).maybeSingle();
  const { data: r } = await db.from("receipts").select("id, is_final, delivery_history").eq("donation_id", id.data).maybeSingle();
  if (!d || !r) return { error: "No receipt exists for this donation." };
  if (!r.is_final) return { error: "This gift has not settled, so no final receipt can be sent yet." };
  await notifyDonor(d.payment_method === "us_bank_account" ? "ach_confirmed" : "donation_success", { donationId: d.id });
  const entry = { at: new Date().toISOString(), by: user.id, kind: "resend" };
  await db.from("receipts").update({ last_sent_at: entry.at, delivery_history: [...(r.delivery_history ?? []), entry] }).eq("id", r.id);
  await audit(user.id, "receipt.resend", "donation", d.id);
  revalidatePath(`/admin/donors/${d.donor_id}`);
  return { ok: true, message: "Receipt email sent." };
}
