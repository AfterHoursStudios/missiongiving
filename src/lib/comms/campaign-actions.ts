"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { getOrgSettings } from "@/lib/settings";
import { publicEnv } from "@/lib/env";
import { sanitizeEmailHtml } from "@/lib/messages";
import { SAMPLE_VARS, findUnknownVariables } from "@/lib/admin/template-logic";
import type { AdminState } from "@/lib/admin/donor-actions";
import { audienceFromForm } from "./audience";
import { renderCampaignEmail } from "./render";
import { zonedLocalToUtc } from "./schedule";
import { previewAudience, runDueCampaigns, sendingProblems } from "./send";

const uuid = z.string().uuid();
const contentSchema = z.object({
  kind: z.enum(["announcement", "project_update"]),
  project_id: z.string().trim().optional().transform((v) => v || null).pipe(z.string().uuid().nullable()),
  subject: z.string().trim().min(1, "Enter a subject").max(150),
  body_html: z.string().trim().min(1, "Write the message").max(50_000),
});

export async function saveCampaign(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("comms.send");
  const content = contentSchema.safeParse(Object.fromEntries(form));
  if (!content.success) return { error: content.error.issues[0].message };
  const audience = audienceFromForm(form);
  if (!audience.success) return { error: audience.error.issues[0].message };
  const body = sanitizeEmailHtml(content.data.body_html);
  const bad = findUnknownVariables(content.data.subject, body);
  if (bad.length) return { error: `Unknown variable${bad.length > 1 ? "s" : ""}: ${bad.map((b) => `{{${b}}}`).join(", ")}` };

  const db = createSupabaseAdminClient();
  const row = { kind: content.data.kind, project_id: content.data.project_id, subject: content.data.subject, body_html: body, audience: audience.data };
  const id = form.get("id");
  if (typeof id === "string" && id) {
    if (!uuid.safeParse(id).success) return { error: "Campaign not found." };
    const { data, error } = await db.from("communication_campaigns").update(row).eq("id", id).eq("status", "draft").select("id");
    if (error || !data?.length) return { error: "Only drafts can be edited. Return a scheduled campaign to draft first." };
    revalidatePath(`/admin/campaigns/${id}`);
    return { ok: true, message: "Draft saved." };
  }
  const { data, error } = await db.from("communication_campaigns").insert({ ...row, created_by: user.id, status: "draft" }).select("id").single();
  if (error || !data) return { error: "Could not create the campaign." };
  redirect(`/admin/campaigns/${data.id}`);
}

/** Sends the draft to the signed-in staff member only, with sample values and a non-functional unsubscribe link. */
export async function sendCampaignTest(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("comms.send");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success || !user.email) return { error: "Cannot send a test email." };
  const { data: c } = await createSupabaseAdminClient().from("communication_campaigns").select("subject, body_html").eq("id", id.data).maybeSingle();
  if (!c) return { error: "Campaign not found." };
  const s = await getOrgSettings();
  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  const r = await renderCampaignEmail({
    subject: `[TEST] ${c.subject}`, bodyHtml: c.body_html, vars: { ...SAMPLE_VARS, organization_name: s.brand_name },
    org: { name: s.brand_name, address: s.mailing_address || "[mailing address not set]" }, unsubscribeUrl: `${base}/unsubscribe`, oneClickUrl: `${base}/api/unsubscribe`,
  });
  const sent = await sendEmail({ to: user.email, subject: r.subject, html: r.html, text: r.text, fromName: s.email_sender_name, replyTo: s.email_reply_to || undefined });
  return sent.skipped ? { error: "Email is not configured (RESEND_API_KEY / EMAIL_FROM_ADDRESS), so nothing was sent." } : { ok: true, message: `Test email sent to ${user.email}.` };
}

const scheduleSchema = z.object({
  id: uuid, mode: z.enum(["now", "later"]), when: z.string().optional(), expected: z.coerce.number().int().min(0), confirm: z.string(),
});

/**
 * The final gate. Requires (1) typing SEND, (2) that the audience size the person reviewed still matches a FRESH recount, and
 * (3) working unsubscribe/email/address configuration. Records who authorized it.
 */
export async function scheduleCampaign(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("comms.send");
  const p = scheduleSchema.safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Please review the form and try again." };
  if (p.data.confirm.trim() !== "SEND") return { error: "Type SEND to confirm." };

  const db = createSupabaseAdminClient();
  const { data: c } = await db.from("communication_campaigns").select("id, kind, audience, status, subject, project_id").eq("id", p.data.id).maybeSingle();
  if (!c || c.status !== "draft") return { error: "Only draft campaigns can be scheduled." };
  const problems = await sendingProblems();
  if (problems.length) return { error: problems.join(" ") };

  const preview = await previewAudience(c);
  if (preview.count === 0) return { error: "The audience is empty. Nothing would be sent." };
  if (preview.count !== p.data.expected) return { error: `The audience changed while you were reviewing (now ${preview.count} recipients, you reviewed ${p.data.expected}). Review the preview and confirm again.` };

  const settings = await getOrgSettings();
  let when = new Date();
  if (p.data.mode === "later") {
    const t = zonedLocalToUtc(p.data.when ?? "", settings.timezone);
    if (!t) return { error: "Choose a date and time." };
    if (t.getTime() < Date.now() + 5 * 60_000) return { error: "Schedule at least 5 minutes from now." };
    if (t.getTime() > Date.now() + 365 * 86_400_000) return { error: "Schedule within the next year." };
    when = t;
  }
  const { data: updated } = await db.from("communication_campaigns")
    .update({ status: "scheduled", scheduled_for: when.toISOString(), authorized_by: user.id, recipient_count: preview.count, last_error: null })
    .eq("id", c.id).eq("status", "draft").select("id");
  if (!updated?.length) return { error: "This campaign was already scheduled." };

  await audit(user.id, "campaign.send", "campaign", c.id, { op: p.data.mode === "now" ? "send_now" : "schedule", scheduled_for: when.toISOString(), recipients: preview.count, kind: c.kind, subject: c.subject, audience: c.audience });
  if (p.data.mode === "now") await runDueCampaigns({ maxBatches: 1 }).catch(() => undefined); // remaining batches continue via the cron
  revalidatePath(`/admin/campaigns/${c.id}`); revalidatePath("/admin/campaigns");
  return { ok: true, message: p.data.mode === "now" ? `Sending started to ${preview.count} recipients. Large lists continue in throttled batches.` : `Scheduled for ${when.toLocaleString("en-US", { timeZone: settings.timezone })} to about ${preview.count} recipients. Consent is re-checked when it sends.` };
}

export async function unscheduleCampaign(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("comms.send");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return { error: "Campaign not found." };
  const { data } = await createSupabaseAdminClient().from("communication_campaigns")
    .update({ status: "draft", scheduled_for: null, authorized_by: null }).eq("id", id.data).eq("status", "scheduled").select("id");
  if (!data?.length) return { error: "Only scheduled campaigns can be returned to draft." };
  await audit(user.id, "campaign.send", "campaign", id.data, { op: "unschedule" });
  revalidatePath(`/admin/campaigns/${id.data}`);
  return { ok: true, message: "Returned to draft." };
}

/** Stops a scheduled or in-progress campaign. Messages already sent cannot be recalled; unsent recipients are skipped. */
export async function cancelCampaign(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("comms.send");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return { error: "Campaign not found." };
  const db = createSupabaseAdminClient();
  const { data } = await db.from("communication_campaigns").update({ status: "canceled" }).eq("id", id.data).in("status", ["draft", "scheduled", "sending"]).select("id");
  if (!data?.length) return { error: "This campaign can't be canceled." };
  await db.from("campaign_recipients").update({ status: "skipped", error: "campaign_canceled" }).eq("campaign_id", id.data).in("status", ["queued", "sending"]);
  await audit(user.id, "campaign.send", "campaign", id.data, { op: "cancel" });
  revalidatePath(`/admin/campaigns/${id.data}`); revalidatePath("/admin/campaigns");
  return { ok: true, message: "Canceled. Unsent recipients were skipped." };
}
