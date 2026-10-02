"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { logCommunication } from "@/lib/comms/log";
import { AUTOMATIC_EVENTS, eventLabel, type AutomaticEmailEvent } from "@/lib/comms/automatic-emails";
import { getOrgSettings } from "@/lib/settings";
import { publicEnv } from "@/lib/env";
import { fillTemplate, sanitizeEmailHtml, type TemplateVars } from "@/lib/messages";
import { formatRichText } from "./project-schema";
import { SAMPLE_VARS, findUnknownVariables, planVersions, templateKeySlug } from "./template-logic";
import type { AdminState } from "./donor-actions";

const saveSchema = z.object({
  key: z.string().regex(/^[a-z_]+$/), subject: z.string().trim().min(1, "Enter a subject").max(200),
  body: z.string().trim().min(1, "Write the message").max(50_000),
});

async function writeVersion(templateId: string, version: number, t: { subject: string; body_html: string; body_text: string }, userId: string) {
  await createSupabaseAdminClient().from("message_template_versions").insert({ template_id: templateId, version, ...t, saved_by: userId });
}

const createTemplateSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  subject: z.string().trim().min(1, "Enter a subject").max(200),
  body: z.string().trim().min(1, "Write the message").max(50_000),
});

/**
 * A custom template for one-off or manual sends (e.g. from a donor's page) — not wired to any automatic send
 * event. The key is derived from the name and de-duplicated; "new" is reserved (it's the New template page's URL).
 */
export async function createTemplate(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("comms.send");
  const p = createTemplateSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const html = sanitizeEmailHtml(formatRichText(p.data.body));
  const text = p.data.body;
  const bad = findUnknownVariables(p.data.subject, html, text);
  if (bad.length) return { error: `Unknown variable${bad.length > 1 ? "s" : ""}: ${bad.map((b) => `{{${b}}}`).join(", ")}` };

  const db = createSupabaseAdminClient();
  const base = templateKeySlug(p.data.name);
  const taken = async (key: string) => key === "new" || !!(await db.from("message_templates").select("id").eq("key", key).maybeSingle()).data;
  let key = base;
  for (let n = 2; await taken(key); n++) key = `${base}_${n}`;

  const { data, error } = await db.from("message_templates")
    .insert({ key, name: p.data.name, subject: p.data.subject, body_html: html, body_text: text, updated_by: user.id })
    .select("id").single();
  if (error || !data) return { error: "Could not create the template." };
  await audit(user.id, "settings.change", "message_template", key, { created: true });
  revalidatePath("/admin/messages");
  redirect(`/admin/messages/${key}`);
}

/** Staff write plain text only; the HTML version sent to donors is generated from it (see formatRichText). */
export async function saveTemplate(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("comms.send");
  const p = saveSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const html = sanitizeEmailHtml(formatRichText(p.data.body));
  const text = p.data.body;
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
  return { ok: true, message: `Saved as version ${plan.newVersion}.` };
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

const sendToDonorSchema = z.object({ donorId: z.string().uuid(), templateKey: z.string().regex(/^[a-z_]+$/) });

/**
 * One-off send of a saved template to a single donor, picked by staff from the donor's page. Hard-blocked for
 * do-not-contact status or a suppressed (bounce/complaint) address, the same absolute rules campaigns enforce;
 * opt-in consent (marketing/project-update) is not checked here since this is a deliberate single send, not a
 * bulk campaign. Vars this donor/template don't have (e.g. a donation-specific template with no matching gift)
 * render blank rather than fail.
 */
export async function sendDonorMessage(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("comms.send");
  const p = sendToDonorSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Choose a message to send." };
  const db = createSupabaseAdminClient();
  const [{ data: donor }, { data: template }, { data: prefs }] = await Promise.all([
    db.from("donor_profiles").select("id, email, first_name, last_name, status").eq("id", p.data.donorId).is("deleted_at", null).maybeSingle(),
    db.from("message_templates").select("subject, body_html, body_text").eq("key", p.data.templateKey).maybeSingle(),
    db.from("communication_preferences").select("suppressed").eq("donor_id", p.data.donorId).maybeSingle(),
  ]);
  if (!donor) return { error: "Donor not found." };
  if (!template) return { error: "Template not found." };
  if (donor.status === "do_not_contact") return { error: "This donor is marked do-not-contact." };
  if (prefs?.suppressed) return { error: "This donor's email is suppressed (a past bounce or complaint) and cannot be sent to." };

  const settings = await getOrgSettings();
  const vars: TemplateVars = {
    donor_first_name: donor.first_name, donor_full_name: `${donor.first_name} ${donor.last_name}`,
    organization_name: settings.brand_name, dashboard_link: `${publicEnv.NEXT_PUBLIC_APP_URL}/dashboard`,
  };
  const r = await sendEmail({
    to: donor.email, subject: fillTemplate(template.subject, vars, "text"),
    html: sanitizeEmailHtml(fillTemplate(template.body_html, vars, "html")), text: fillTemplate(template.body_text, vars, "text"),
    fromName: settings.email_sender_name, replyTo: settings.email_reply_to || undefined, tags: [{ name: "kind", value: "manual" }],
  });
  if (r.skipped) return { error: "Email is not configured (RESEND_API_KEY / EMAIL_FROM_ADDRESS), so nothing was sent." };
  await audit(user.id, "message.send", "donor", donor.id, { template_key: p.data.templateKey });
  await logCommunication({ donorId: donor.id, kind: "message", subject: fillTemplate(template.subject, vars, "text"), templateKey: p.data.templateKey, createdBy: user.id });
  return { ok: true, message: `Message sent to ${donor.email}.` };
}

/**
 * "Used for": sets which automatic emails this template is sent for. Ticked events now use this template (taking them
 * over from any other template); events this template had but are now unticked are left with no template (no email).
 */
export async function setTemplateUsage(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("comms.send");
  const key = z.string().regex(/^[a-z_]+$/).safeParse(form.get("key"));
  const events = z.array(z.enum(AUTOMATIC_EVENTS as [AutomaticEmailEvent, ...AutomaticEmailEvent[]])).safeParse(form.getAll("event"));
  if (!key.success || !events.success) return { error: "Invalid request." };
  const db = createSupabaseAdminClient();
  const { data: t } = await db.from("message_templates").select("id").eq("key", key.data).maybeSingle();
  if (!t) return { error: "Template not found." };

  const { error: delErr } = await db.from("message_assignments").delete().eq("template_id", t.id).not("event", "in", `(${events.data.map((e) => `"${e}"`).join(",") || '""'})`);
  if (delErr) return { error: "Could not save. (Has database migration 0020 been applied?)" };
  if (events.data.length) {
    const { error } = await db.from("message_assignments").upsert(events.data.map((event) => ({ event, template_id: t.id, updated_by: user.id, updated_at: new Date().toISOString() })));
    if (error) return { error: "Could not save. (Has database migration 0020 been applied?)" };
  }
  await audit(user.id, "settings.change", "message_template", key.data, { used_for: events.data });
  revalidatePath("/admin/messages");
  revalidatePath(`/admin/messages/${key.data}`);
  return { ok: true, message: events.data.length ? `Used for: ${events.data.map(eventLabel).join(", ")}.` : "Not used for any automatic email." };
}
