"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { notifyDonor } from "@/lib/donations/notify";
import { normalizeEmail } from "./duplicates";
import { isPlaceholderEmail } from "./dp-import";
import { logCommunication } from "@/lib/comms/log";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";

export type AdminState = { ok?: boolean; error?: string; message?: string } | undefined;
const uuid = z.string().uuid();

async function donorExists(id: string) {
  const { data } = await createSupabaseAdminClient().from("donor_profiles").select("id").eq("id", id).is("deleted_at", null).maybeSingle();
  return !!data;
}

const createSchema = z.object({
  first_name: z.string().trim().min(1, "Enter a first name").max(80),
  last_name: z.string().trim().min(1, "Enter a last name").max(80),
  email: z.string().trim().max(200).email("Enter a valid email"),
  phone: z.string().trim().max(30).optional(),
  organization_name: z.string().trim().max(120).optional(),
  address_line1: z.string().trim().max(120).optional(),
  address_line2: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  region: z.string().trim().max(80).optional(),
  postal_code: z.string().trim().max(20).optional(),
});

/**
 * Manual entry for a donor who has not given online yet (a phone pledge, a paper form, a household contact).
 * Checks for an existing record by normalized email first so staff don't create an avoidable duplicate;
 * `/admin/donors/duplicates` remains the tool for merging any that slip through another way.
 */
export async function createDonor(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("donors.edit");
  const p = createSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const db = createSupabaseAdminClient();
  const normalized = normalizeEmail(p.data.email);
  const { data: existing } = await db.from("donor_profiles").select("id, first_name, last_name")
    .eq("normalized_email", normalized).is("deleted_at", null).maybeSingle();
  if (existing) return { error: `A donor with this email already exists: ${existing.first_name} ${existing.last_name}. Search for them instead of creating a duplicate.` };

  const { email, phone, organization_name, address_line1, address_line2, city, region, postal_code, ...rest } = p.data;
  const { data, error } = await db.from("donor_profiles").insert({
    ...rest, email, normalized_email: normalized,
    phone: phone || null, organization_name: organization_name || null,
    address_line1: address_line1 || null, address_line2: address_line2 || null,
    city: city || null, region: region || null, postal_code: postal_code || null,
  }).select("id").single();
  if (error || !data) return { error: "Could not create the donor." };
  // New donors start opted in to news, project updates and the annual statement (also set by migration 0021's trigger).
  await db.from("communication_preferences").upsert({ donor_id: data.id, marketing_email: true, project_updates: true, annual_statement_email: true }, { onConflict: "donor_id", ignoreDuplicates: true });
  await audit(user.id, "donor.create", "donor", data.id);
  revalidatePath("/admin/donors");
  redirect(`/admin/donors/${data.id}`);
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
  country: z.string().trim().max(2).optional(),
  email: z.string().trim().max(200).email("Enter a valid email").optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "lapsed", "do_not_contact"]),
});

/** Nonfinancial corrections only. Email, Stripe ids, amounts and statuses of gifts are not editable here. */
export async function updateDonor(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("donors.edit");
  const p = editSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const { id, email, ...v } = p.data;
  const db = createSupabaseAdminClient();
  const { data: before } = await db.from("donor_profiles").select("first_name, last_name, phone, organization_name, address_line1, address_line2, city, region, postal_code, country, status, email").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!before) return { error: "Donor not found." };
  // An imported donor with no email has a placeholder; staff may replace it once with a real address.
  // A real email stays locked here because it's the donor's sign-in and receipt address.
  let emailUpdate: { email: string; normalized_email: string } | null = null;
  if (email && isPlaceholderEmail(before.email)) {
    const normalized = normalizeEmail(email);
    const { data: taken } = await db.from("donor_profiles").select("first_name, last_name").eq("normalized_email", normalized).is("deleted_at", null).neq("id", id).maybeSingle();
    if (taken) return { error: `That email already belongs to ${taken.first_name} ${taken.last_name}. Use Find duplicates to merge the two records.` };
    emailUpdate = { email: email.toLowerCase(), normalized_email: normalized };
  }
  const next = { ...v, phone: v.phone || null, organization_name: v.organization_name || null, address_line1: v.address_line1 || null, address_line2: v.address_line2 || null, city: v.city || null, region: v.region || null, postal_code: v.postal_code || null, country: v.country ? v.country.toUpperCase() : null };
  const { error } = await db.from("donor_profiles").update({ ...next, ...emailUpdate }).eq("id", id);
  if (error) return { error: "Could not save changes." };
  const changed = [...Object.keys(next).filter((k) => (before as Record<string, unknown>)[k] !== (next as Record<string, unknown>)[k]), ...(emailUpdate ? ["email"] : [])];
  await audit(user.id, "donor.update", "donor", id, { changed_fields: changed }); // field names only, not values
  revalidatePath(`/admin/donors/${id}`);
  return { ok: true, message: "Donor updated." };
}

const contactSchema = z.object({
  id: uuid,
  channel: z.enum(["phone", "mail", "email", "in_person", "other"]),
  subject: z.string().trim().min(1, "Describe the contact").max(200),
  detail: z.string().trim().max(2000).optional(),
});

/** Staff record a contact made outside the system (a thank-you call, a mailed letter) so it shows on the donor's Contacts tab. */
export async function logContact(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("donors.edit");
  const p = contactSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!(await donorExists(p.data.id))) return { error: "Donor not found." };
  await logCommunication({ donorId: p.data.id, kind: "logged", channel: p.data.channel, subject: p.data.subject, detail: p.data.detail || null, status: "logged", createdBy: user.id });
  await audit(user.id, "donor.update", "donor", p.data.id, { field: "contact_logged" });
  revalidatePath(`/admin/donors/${p.data.id}`);
  return { ok: true, message: "Contact logged." };
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

/**
 * Permanently deletes a donor and every record tied to them: donations, receipts, refunds, recurring gifts, notes,
 * tags, communications and to-dos. Stripe is cleaned up FIRST (subscriptions canceled, customer deleted) so the donor
 * is never charged again; if Stripe can't be reached nothing is deleted. A donor-only sign-in account is removed too;
 * a login that is also a staff account is kept. The audit entry records counts only, never who the donor was.
 */
export async function deleteDonor(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("donors.delete");
  const p = z.object({ id: uuid, confirm: z.literal("DELETE") }).safeParse({ id: form.get("id"), confirm: String(form.get("confirm") ?? "").trim() });
  if (!p.success) return { error: "Type DELETE (in capitals) to confirm." };
  const db = createSupabaseAdminClient();
  const { data: donor } = await db.from("donor_profiles").select("id, user_id, stripe_customer_id").eq("id", p.data.id).maybeSingle();
  if (!donor) return { error: "Donor not found." };

  const { data: subs } = await db.from("recurring_donations").select("stripe_subscription_id").eq("donor_id", donor.id).not("stripe_subscription_id", "is", null).not("status", "in", "(canceled,completed)");
  if ((subs?.length || donor.stripe_customer_id) && !isStripeConfigured()) return { error: "Payments aren't configured, so this donor's Stripe recurring gifts can't be canceled. Nothing was deleted." };
  try {
    const stripe = isStripeConfigured() ? getStripe() : null;
    const gone = (e: unknown) => (e as { code?: string })?.code === "resource_missing";
    for (const s of subs ?? []) await stripe!.subscriptions.cancel(s.stripe_subscription_id!).catch((e) => { if (!gone(e)) throw e; });
    if (donor.stripe_customer_id) await stripe!.customers.del(donor.stripe_customer_id).catch((e) => { if (!gone(e)) throw e; });
  } catch {
    return { error: "Stripe couldn't cancel this donor's recurring gifts or remove their saved payment methods. Nothing was deleted; try again." };
  }

  const { data: result, error } = await db.rpc("delete_donor_completely", { p_donor: donor.id });
  if (error) return { error: "The donor could not be deleted. Their recurring gifts were canceled in Stripe, but no records were removed." };

  let loginRemoved = false;
  if (donor.user_id) {
    const [{ data: staff }, { data: roles }] = await Promise.all([
      db.from("staff_profiles").select("user_id").eq("user_id", donor.user_id).maybeSingle(),
      db.from("staff_role_assignments").select("user_id").eq("user_id", donor.user_id).limit(1),
    ]);
    if (!staff && !(roles ?? []).length) loginRemoved = !(await db.auth.admin.deleteUser(donor.user_id)).error;
  }
  await audit(user.id, "donor.delete", "donor", donor.id, {
    donations_deleted: result?.donations_deleted ?? 0, recurring_deleted: result?.recurring_deleted ?? 0,
    stripe_subscriptions_canceled: subs?.length ?? 0, login_removed: loginRemoved,
  });
  revalidatePath("/admin/donors");
  revalidatePath("/admin");
  redirect("/admin/donors?deleted=1");
}

/**
 * Staff update a donor's contact preferences (Main tab). The three opt-ins are set as ticked. "Email suppressed" blocks
 * all campaign email: ticking it adds a manual block; unticking clears a bounce or manual block, but a spam complaint
 * or the donor's own unsubscribe is never overridden here (email law), and staff are told so.
 */
export async function updateContactPreferences(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("donors.edit");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return { error: "Donor not found." };
  const on = (k: string) => form.get(k) === "on";
  const db = createSupabaseAdminClient();
  const [{ data: donor }, { data: before }] = await Promise.all([
    db.from("donor_profiles").select("id, email, normalized_email").eq("id", id.data).is("deleted_at", null).maybeSingle(),
    db.from("communication_preferences").select("marketing_email, project_updates, annual_statement_email, suppressed").eq("donor_id", id.data).maybeSingle(),
  ]);
  if (!donor) return { error: "Donor not found." };
  const email = String(donor.normalized_email ?? donor.email).toLowerCase();
  const suppress = on("suppressed");

  let kept: string | null = null;
  if (suppress) {
    await db.from("email_suppressions").upsert({ email, reason: "manual", created_by: user.id }, { onConflict: "email", ignoreDuplicates: true });
  } else {
    const { data: row } = await db.from("email_suppressions").select("reason").eq("email", email).maybeSingle();
    if (row && (row.reason === "complaint" || row.reason === "unsubscribe")) kept = row.reason;
    else if (row) await db.from("email_suppressions").delete().eq("email", email);
  }

  const next = {
    marketing_email: on("marketing_email"), project_updates: on("project_updates"), annual_statement_email: on("annual_statement_email"),
    suppressed: suppress || !!kept, suppressed_reason: suppress ? "manual" : kept ? kept : null,
  };
  const { error } = await db.from("communication_preferences").upsert({ donor_id: donor.id, ...next, updated_at: new Date().toISOString() });
  if (error) return { error: "Could not save the preferences." };
  const changed = (["marketing_email", "project_updates", "annual_statement_email", "suppressed"] as const)
    .filter((k) => (before as Record<string, unknown> | null)?.[k] !== next[k]);
  await audit(user.id, "donor.update", "donor", donor.id, { field: "contact_preferences", changed_fields: changed });
  revalidatePath(`/admin/donors/${donor.id}`);
  if (kept) {
    return { ok: true, message: `Preferences saved. Email stays blocked: this donor ${kept === "complaint" ? "marked an email as spam" : "unsubscribed"}, which staff can't override.` };
  }
  return { ok: true, message: "Contact preferences saved." };
}
