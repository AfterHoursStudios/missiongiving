"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { formTemplateSchema, blockSchema } from "./form-template-schema";
import { uploadImageFile } from "./project-images";
import type { AdminState } from "./donor-actions";

const boolField = (form: FormData, name: string) => form.get(name) === "on";

/** Uploads one image block's photo (called directly from the builder as the file is chosen, not tied to the Save button). */
export async function uploadFormBlockImage(file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  await requirePermission("projects.manage");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image file." };
  const r = await uploadImageFile(createSupabaseAdminClient(), file, "forms");
  return "error" in r ? { ok: false, error: r.error } : { ok: true, url: r.url };
}

/**
 * Creates or updates a donation form template. The `blocks` field arrives as one JSON array built client-side by the
 * builder (see FormTemplateBuilder); everything else is a plain named field, same as the rest of the admin's forms.
 */
export async function saveFormTemplate(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("projects.manage");
  let blocksRaw: unknown;
  try { blocksRaw = JSON.parse(String(form.get("blocks") || "[]")); } catch { return { error: "The form's content blocks could not be read. Please try again." }; }
  const blocksParsed = z.array(blockSchema).max(20).safeParse(blocksRaw);
  if (!blocksParsed.success) return { error: "One of the content blocks is missing required text." };

  const parsed = formTemplateSchema.safeParse({
    name: form.get("name"), status: form.get("status"),
    background_color: form.get("background_color"), accent_color: form.get("accent_color"),
    blocks: blocksParsed.data,
    show_phone: boolField(form, "show_phone"), show_address: boolField(form, "show_address"),
    show_organization: boolField(form, "show_organization"), show_dedication: boolField(form, "show_dedication"),
    allow_one_time: boolField(form, "allow_one_time"), allow_monthly: boolField(form, "allow_monthly"), allow_yearly: boolField(form, "allow_yearly"),
    submit_label: form.get("submit_label"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const db = createSupabaseAdminClient();
  const id = form.get("id");
  const editingId = typeof id === "string" && id ? id : null;
  if (editingId && !z.string().uuid().safeParse(editingId).success) return { error: "Form not found." };

  if (editingId) {
    const { error } = await db.from("donation_form_templates").update(parsed.data).eq("id", editingId);
    if (error) return { error: "Could not save the form." };
    await audit(user.id, "form_template.change", "donation_form_template", editingId, { op: "update" });
    revalidatePath("/admin/forms"); revalidatePath(`/admin/forms/${editingId}`);
    return { ok: true, message: "Saved." };
  }

  const { data: created, error } = await db.from("donation_form_templates").insert({ ...parsed.data, created_by: user.id }).select("id").single();
  if (error || !created) return { error: "Could not create the form." };
  await audit(user.id, "form_template.change", "donation_form_template", created.id, { op: "create" });
  revalidatePath("/admin/forms");
  redirect(`/admin/forms/${created.id}`);
}

/** Makes this the form shown for a plain "Donate now" link with no project or campaign. At most one template can hold this. */
export async function setDefaultFormTemplate(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("projects.manage");
  const id = String(form.get("id") || "");
  if (!z.string().uuid().safeParse(id).success) return { error: "Form not found." };
  const db = createSupabaseAdminClient();
  await db.from("donation_form_templates").update({ is_default: false }).eq("is_default", true).neq("id", id);
  const { error } = await db.from("donation_form_templates").update({ is_default: true }).eq("id", id);
  if (error) return { error: "Could not set this as the default form." };
  await audit(user.id, "form_template.change", "donation_form_template", id, { op: "set_default" });
  revalidatePath("/admin/forms");
  return { ok: true, message: "This is now the default form for Donate now links." };
}

export async function archiveFormTemplate(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("projects.manage");
  const id = String(form.get("id") || "");
  if (!z.string().uuid().safeParse(id).success) return { error: "Form not found." };
  const { error } = await createSupabaseAdminClient().from("donation_form_templates").update({ status: "archived" }).eq("id", id);
  if (error) return { error: "Could not archive the form." };
  await audit(user.id, "form_template.change", "donation_form_template", id, { op: "archive" });
  revalidatePath("/admin/forms");
  redirect("/admin/forms");
}
