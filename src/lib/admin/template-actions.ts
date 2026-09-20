"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { getOrgSettings } from "@/lib/settings";
import { fillTemplate, htmlToText, sanitizeEmailHtml } from "@/lib/messages";
import { SAMPLE_VARS, findUnknownVariables, planVersions } from "./template-logic";
import type { AdminState } from "./donor-actions";

const saveSchema = z.object({
  key: z.string().regex(/^[a-z_]+$/), subject: z.string().trim().min(1, "Enter a subject").max(200),
  body_html: z.string().trim().min(1, "Write the message").max(50_000), body_text: z.string().max(50_000).optional(),
});

async function writeVersion(templateId: string, version: number, t: { subject: string; body_html: string; body_text: string }, userId: string) {
  await createSupabaseAdminClient().from("message_template_versions").insert({ template_id: templateId, version, ...t, saved_by: userId });
}

export async function saveTemplate(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("comms.send");
  const p = saveSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const html = sanitizeEmailHtml(p.data.body_html);
  const text = p.data.body_text?.trim() || htmlToText(html); // plain-text fallback is generated when left blank
  const bad = findUnknownVariables(p.data.subject, html, text);
  if (bad.length) return { error: `Unknown variable${bad.length > 1 ? "s" : ""}: ${bad.map((b) => `{{${b}}}`).join(", ")}` };

  const db = createSupabaseAdminClient();
  const { data: cur } = await db.from("message_templates").select("id, subject, body_html, body_text").eq("key", p.data.key).maybeSingle();
  if (!cur) return { error: "Template not found." };
  const { data: last } = await db.from("message_template_versions").select("version").eq("template_id", cur.id).order("version", { ascending: false }).limit(1);
  const plan = planVersions(last?.[0]?.version ?? 0);
  if (plan.snapshotOriginal) await writeVersion(cur.id, 1, cur, user.id);
  const next = { subject: p.data.subject, body_html: html, body_text: text };
  const { error } = await db.from("message_templates").update({ ...next, updated_by: user.id }).eq("id", cur.id);
  if (error) return { error: "Could not save the template." };
  await writeVersion(cur.id, plan.newVersion, next, user.id);
  await audit(user.id, "settings.change", "message_template", p.data.key, { version: plan.newVersion });
  revalidatePath(`/admin/messages/${p.data.key}`);
  return { ok: true, message: `Saved as version ${plan.newVersion}. Body was sanitized.` };
}

export async function restoreVersion(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("comms.send");
  const p = z.object({ key: z.string().regex(/^[a-z_]+$/), versionId: z.string().uuid() }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Version not found." };
  const db = createSupabaseAdminClient();
  const { data: tpl } = await db.from("message_templates").select("id").eq("key", p.data.key).maybeSingle();
  const { data: v } = await db.from("message_template_versions").select("subject, body_html, body_text, version").eq("id", p.data.versionId).eq("template_id", tpl?.id ?? "").maybeSingle();
  if (!tpl || !v) return { error: "Version not found." };
  const { data: last } = await db.from("message_template_versions").select("version").eq("template_id", tpl.id).order("version", { ascending: false }).limit(1);
  const nextVersion = (last?.[0]?.version ?? 0) + 1;
  const content = { subject: v.subject, body_html: v.body_html, body_text: v.body_text };
  await db.from("message_templates").update({ ...content, updated_by: user.id }).eq("id", tpl.id);
  await writeVersion(tpl.id, nextVersion, content, user.id);
  await audit(user.id, "settings.change", "message_template", p.data.key, { restored_from: v.version, version: nextVersion });
  revalidatePath(`/admin/messages/${p.data.key}`);
  return { ok: true, message: `Restored version ${v.version} as new version ${nextVersion}.` };
}

/** Sends the SAVED template, filled with sample data, to the signed-in staff member only. */
export async function sendTestEmail(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("comms.send");
  const key = z.string().regex(/^[a-z_]+$/).safeParse(form.get("key"));
  if (!key.success || !user.email) return { error: "Cannot send a test email." };
  const { data: t } = await createSupabaseAdminClient().from("message_templates").select("subject, body_html, body_text").eq("key", key.data).maybeSingle();
  if (!t) return { error: "Template not found." };
  const settings = await getOrgSettings();
  const r = await sendEmail({
    to: user.email, subject: `[TEST] ${fillTemplate(t.subject, SAMPLE_VARS, "text")}`,
    html: sanitizeEmailHtml(fillTemplate(t.body_html, SAMPLE_VARS, "html")), text: fillTemplate(t.body_text, SAMPLE_VARS, "text"),
    fromName: settings.email_sender_name, replyTo: settings.email_reply_to || undefined,
  });
  return r.skipped ? { error: "Email is not configured (RESEND_API_KEY / EMAIL_FROM_ADDRESS), so nothing was sent." } : { ok: true, message: `Test email sent to ${user.email}.` };
}
