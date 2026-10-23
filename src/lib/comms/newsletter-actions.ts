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
import { htmlToText, sanitizeEmailHtml } from "@/lib/messages";
import { SAMPLE_VARS, findUnknownVariables } from "@/lib/admin/template-logic";
import { newsletterDesignSchema, starterDesign, type NewsletterDesign } from "./newsletter";
import { renderNewsletterEmail } from "./render-newsletter";

const uuid = z.string().uuid();
type Result = { ok: true; message: string } | { ok: false; error: string };

/** Everything a newsletter says, for the merge-field check and the stored text copy. */
function allText(subject: string, d: NewsletterDesign) {
  const parts = [subject, d.preheader, d.title, d.dateLine];
  for (const b of d.blocks) {
    if (b.type === "heading") parts.push(b.text);
    if (b.type === "text") parts.push(b.html);
    if (b.type === "image") parts.push(b.alt, b.caption);
    if (b.type === "button") parts.push(b.label);
    if (b.type === "story") parts.push(b.title, b.html, b.alt, b.linkLabel);
  }
  return parts;
}

/** Starts a new newsletter from the starter layout and opens it in the builder. */
export async function createNewsletter(): Promise<void> {
  const { user } = await requirePermission("comms.send");
  const s = await getOrgSettings();
  const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: s.timezone });
  const design = starterDesign(s.brand_name, month);
  const { data, error } = await createSupabaseAdminClient().from("communication_campaigns").insert({
    kind: "announcement", subject: `${s.brand_name} News · ${month}`, body_html: "<p>Newsletter</p>", audience: {}, design, status: "draft", created_by: user.id,
  }).select("id").single();
  if (error || !data) throw new Error("Could not create the newsletter. (Has database migration 0028 been applied?)");
  redirect(`/admin/newsletters/${data.id}`);
}

const saveSchema = z.object({ id: uuid, subject: z.string().trim().min(1, "Enter a subject line").max(150), design: newsletterDesignSchema });

/** Saves a draft newsletter's subject and blocks. Sent or scheduled newsletters can't change. */
export async function saveNewsletter(raw: unknown): Promise<Result> {
  await requirePermission("comms.send");
  const p = saveSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id, subject, design } = p.data;
  const bad = findUnknownVariables(...allText(subject, design));
  if (bad.length) return { ok: false, error: `Unknown merge field${bad.length > 1 ? "s" : ""}: ${bad.map((b) => `{{${b}}}`).join(", ")}` };
  const textHtml = sanitizeEmailHtml(design.blocks.map((b) => (b.type === "text" || b.type === "story" ? b.html : "")).join(""));
  const { data, error } = await createSupabaseAdminClient().from("communication_campaigns")
    .update({ subject, design, body_html: textHtml || "<p>Newsletter</p>", body_text: htmlToText(textHtml) })
    .eq("id", id).eq("status", "draft").not("design", "is", null).select("id");
  if (error || !data?.length) return { ok: false, error: "Only draft newsletters can be edited." };
  revalidatePath(`/admin/newsletters/${id}`);
  return { ok: true, message: "Newsletter saved." };
}

/** Sends the SAVED newsletter to the signed-in staff member, with sample donor details. */
export async function sendNewsletterTest(id: string): Promise<Result> {
  const { user } = await requirePermission("comms.send");
  if (!uuid.safeParse(id).success || !user.email) return { ok: false, error: "Cannot send a test email." };
  const { data: c } = await createSupabaseAdminClient().from("communication_campaigns").select("subject, design").eq("id", id).maybeSingle();
  if (!c?.design) return { ok: false, error: "Newsletter not found." };
  const s = await getOrgSettings();
  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  const r = await renderNewsletterEmail({
    subject: `[TEST] ${c.subject}`, design: c.design, vars: { ...SAMPLE_VARS, organization_name: s.brand_name },
    org: { name: s.brand_name, address: s.mailing_address || "[mailing address not set]" }, unsubscribeUrl: `${base}/unsubscribe`, oneClickUrl: `${base}/api/unsubscribe`,
  });
  const sent = await sendEmail({ to: user.email, subject: r.subject, html: r.html, text: r.text, fromName: s.email_sender_name, replyTo: s.email_reply_to || undefined });
  return sent.skipped ? { ok: false, error: "Email is not configured (RESEND_API_KEY / EMAIL_FROM_ADDRESS), so nothing was sent." } : { ok: true, message: `Test sent to ${user.email}. Save first if you have changes.` };
}

/** Copies a newsletter (any status) into a new draft, to reuse its layout. */
export async function duplicateNewsletter(id: string): Promise<void> {
  const { user } = await requirePermission("comms.send");
  if (!uuid.safeParse(id).success) throw new Error("Newsletter not found.");
  const db = createSupabaseAdminClient();
  const { data: c } = await db.from("communication_campaigns").select("subject, design, body_html, body_text").eq("id", id).maybeSingle();
  if (!c?.design) throw new Error("Newsletter not found.");
  const { data, error } = await db.from("communication_campaigns").insert({
    kind: "announcement", subject: `Copy of ${c.subject}`.slice(0, 150), design: c.design, body_html: c.body_html, body_text: c.body_text, audience: {}, status: "draft", created_by: user.id,
  }).select("id").single();
  if (error || !data) throw new Error("Could not copy the newsletter.");
  redirect(`/admin/newsletters/${data.id}`);
}

/** Deletes a draft newsletter (never one that was scheduled or sent). */
export async function deleteNewsletterDraft(id: string): Promise<Result> {
  const { user } = await requirePermission("comms.send");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Newsletter not found." };
  const { data } = await createSupabaseAdminClient().from("communication_campaigns").delete().eq("id", id).eq("status", "draft").not("design", "is", null).select("id");
  if (!data?.length) return { ok: false, error: "Only drafts can be deleted." };
  await audit(user.id, "campaign.send", "campaign", id, { op: "delete_newsletter_draft" });
  revalidatePath("/admin/newsletters");
  return { ok: true, message: "Draft deleted." };
}
