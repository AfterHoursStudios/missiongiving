import "server-only";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { publicEnv, serverEnv } from "@/lib/env";
import { getOrgSettings } from "@/lib/settings";
import { audienceSchema, consentBlock, selectRecipients, type CampaignKind } from "./audience";
import { loadAudienceData } from "./data";
import { renderCampaignEmail } from "./render";
import { signUnsubscribe } from "./security";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const STALE_MS = 10 * 60_000;

/** Everything sending depends on. Sending is blocked (not silently skipped) if any of it is missing. */
export async function sendingProblems(): Promise<string[]> {
  const env = serverEnv();
  const s = await getOrgSettings();
  const problems: string[] = [];
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM_ADDRESS) problems.push("Email is not configured (RESEND_API_KEY and EMAIL_FROM_ADDRESS).");
  if (!env.UNSUBSCRIBE_SECRET || env.UNSUBSCRIBE_SECRET.length < 16) problems.push("UNSUBSCRIBE_SECRET must be set (16+ characters) so every email can carry a working unsubscribe link.");
  if (!s.mailing_address.trim()) problems.push("Add the organization's mailing address in Settings; it is required in the footer of fundraising email.");
  return problems;
}

export interface CampaignRow { id: string; kind: CampaignKind; subject: string; body_html: string; audience: unknown; project_id: string | null; status: string }

export async function previewAudience(campaign: Pick<CampaignRow, "kind" | "audience">) {
  const { donors, suppressed } = await loadAudienceData();
  const filters = audienceSchema.parse(campaign.audience ?? {});
  const r = selectRecipients(donors, filters, campaign.kind, suppressed, new Date());
  return { count: r.recipients.length, excluded: r.excluded, sample: r.recipients.slice(0, 5).map((d) => `${d.first_name} ${d.last_name.charAt(0)}.`) };
}

/** Snapshots the audience at send time into campaign_recipients (consent is re-checked again before every batch). */
export async function materializeRecipients(campaignId: string): Promise<number> {
  const db = createSupabaseAdminClient();
  const { data: c } = await db.from("communication_campaigns").select("id, kind, audience").eq("id", campaignId).single();
  if (!c) throw new Error("campaign not found");
  const { donors, suppressed } = await loadAudienceData();
  const r = selectRecipients(donors, audienceSchema.parse(c.audience ?? {}), c.kind, suppressed, new Date());
  for (let i = 0; i < r.recipients.length; i += 500) {
    const rows = r.recipients.slice(i, i + 500).map((d) => ({ campaign_id: campaignId, donor_id: d.id, email: d.email.trim().toLowerCase(), status: "queued" }));
    const { error } = await db.from("campaign_recipients").upsert(rows, { onConflict: "campaign_id,donor_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  await db.from("communication_campaigns").update({ recipient_count: r.recipients.length }).eq("id", campaignId);
  return r.recipients.length;
}

type BatchOutcome = { processed: number; sent: number; skipped: number; failed: number; rateLimited: boolean };

async function processBatch(campaign: CampaignRow, size: number): Promise<BatchOutcome> {
  const db = createSupabaseAdminClient();
  const out: BatchOutcome = { processed: 0, sent: 0, skipped: 0, failed: 0, rateLimited: false };
  const { data: queued } = await db.from("campaign_recipients").select("id").eq("campaign_id", campaign.id).eq("status", "queued").limit(size);
  if (!queued?.length) return out;

  // Claim atomically: a concurrent worker updating the same rows can't double-send.
  const { data: claimed } = await db.from("campaign_recipients").update({ status: "sending", updated_at: new Date().toISOString() })
    .in("id", queued.map((q) => q.id)).eq("status", "queued").select("id, donor_id");
  if (!claimed?.length) return out;
  out.processed = claimed.length;

  const donorIds = claimed.map((c) => c.donor_id);
  const [{ data: profiles }, { data: prefs }] = await Promise.all([
    db.from("donor_profiles").select("id, email, first_name, last_name, status, deleted_at").in("id", donorIds),
    db.from("communication_preferences").select("donor_id, marketing_email, project_updates, suppressed").in("donor_id", donorIds),
  ]);
  const emails = (profiles ?? []).map((p) => String(p.email).toLowerCase());
  const { data: supp } = await db.from("email_suppressions").select("email").in("email", emails.length ? emails : ["-"]);
  const suppressed = new Set((supp ?? []).map((s) => String(s.email).toLowerCase()));

  const env = serverEnv(), settings = await getOrgSettings();
  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  const projectTitle = campaign.project_id ? (await db.from("projects").select("title").eq("id", campaign.project_id).maybeSingle()).data?.title : null;
  const now = () => new Date().toISOString();
  const token = (donorId: string) => signUnsubscribe(env.UNSUBSCRIBE_SECRET!, donorId, campaign.id);

  const ready: { recipientId: string; to: string; rendered: Awaited<ReturnType<typeof renderCampaignEmail>> }[] = [];
  for (const c of claimed) {
    const p = profiles?.find((x) => x.id === c.donor_id);
    const pr = prefs?.find((x) => x.donor_id === c.donor_id);
    // Consent is re-checked NOW, against current data: an unsubscribe since scheduling always wins.
    const block = !p || p.deleted_at ? "no_email" : consentBlock({ email: p.email ?? "", status: p.status, marketing_email: pr?.marketing_email ?? false, project_updates: pr?.project_updates ?? false, suppressed: pr?.suppressed ?? false }, campaign.kind, suppressed);
    if (block || !p) { out.skipped++; await db.from("campaign_recipients").update({ status: "skipped", error: block ?? "missing", updated_at: now() }).eq("id", c.id); continue; }
    const rendered = await renderCampaignEmail({
      subject: campaign.subject, bodyHtml: campaign.body_html,
      vars: { donor_first_name: p.first_name, donor_full_name: `${p.first_name} ${p.last_name}`, project_name: projectTitle ?? "", organization_name: settings.brand_name, dashboard_link: `${base}/dashboard` },
      org: { name: settings.brand_name, address: settings.mailing_address },
      unsubscribeUrl: `${base}/unsubscribe?t=${token(p.id)}`,
      oneClickUrl: `${base}/api/unsubscribe?t=${token(p.id)}`,
    });
    ready.push({ recipientId: c.id, to: String(p.email).trim().toLowerCase(), rendered });
  }
  if (!ready.length) return out;

  const resend = new Resend(env.RESEND_API_KEY);
  const from = `${settings.email_sender_name} <${env.EMAIL_FROM_ADDRESS}>`;
  const res = await resend.batch.send(ready.map((r) => ({
    from, to: r.to, subject: r.rendered.subject, html: r.rendered.html, text: r.rendered.text, headers: r.rendered.headers,
    replyTo: settings.email_reply_to || undefined, tags: [{ name: "campaign_id", value: campaign.id }],
  })));

  if (res.error) {
    const rateLimited = res.error.statusCode === 429 || /rate_limit/i.test(res.error.name);
    if (rateLimited) {
      // Put them back; the next run continues (provider limits respected).
      await db.from("campaign_recipients").update({ status: "queued", updated_at: now() }).in("id", ready.map((r) => r.recipientId)).eq("status", "sending");
      out.rateLimited = true; return out;
    }
    out.failed += ready.length;
    await db.from("campaign_recipients").update({ status: "failed", error: res.error.name, updated_at: now() }).in("id", ready.map((r) => r.recipientId));
    await db.from("communication_campaigns").update({ last_error: `Provider error: ${res.error.name}` }).eq("id", campaign.id);
    return out;
  }
  const ids = (res.data as unknown as { data?: { id: string }[] } | null)?.data ?? [];
  await Promise.all(ready.map((r, i) => db.from("campaign_recipients").update({ status: ids[i]?.id ? "sent" : "failed", provider_message_id: ids[i]?.id ?? null, error: ids[i]?.id ? null : "no_id", updated_at: now() }).eq("id", r.recipientId)));
  out.sent += ids.filter(Boolean).length; out.failed += ready.length - ids.filter(Boolean).length;
  return out;
}

export interface RunSummary { started: number; sent: number; skipped: number; failed: number; completed: number; rateLimited: boolean; blocked?: string[] }

/**
 * One throttled pass: start due scheduled campaigns, reclaim stalled rows, send up to `maxBatches` batches, complete finished
 * campaigns. Safe to call repeatedly and concurrently (all state changes are conditional updates).
 */
export async function runDueCampaigns(opts: { maxBatches?: number } = {}): Promise<RunSummary> {
  const summary: RunSummary = { started: 0, sent: 0, skipped: 0, failed: 0, completed: 0, rateLimited: false };
  const problems = await sendingProblems();
  if (problems.length) return { ...summary, blocked: problems };
  const db = createSupabaseAdminClient();
  const size = Math.min(100, Math.max(1, Number(serverEnv().EMAIL_BATCH_SIZE) || 50));

  const { data: due } = await db.from("communication_campaigns").select("id").eq("status", "scheduled").lte("scheduled_for", new Date().toISOString());
  for (const c of due ?? []) {
    const { data: claimed } = await db.from("communication_campaigns").update({ status: "sending" }).eq("id", c.id).eq("status", "scheduled").select("id");
    if (claimed?.length) { await materializeRecipients(c.id); summary.started++; }
  }

  const { data: sending } = await db.from("communication_campaigns").select("id, kind, subject, body_html, audience, project_id, status").eq("status", "sending");
  if (!sending?.length) return summary;
  await db.from("campaign_recipients").update({ status: "queued", updated_at: new Date().toISOString() })
    .in("campaign_id", sending.map((s) => s.id)).eq("status", "sending").lt("updated_at", new Date(Date.now() - STALE_MS).toISOString());

  let batches = 0;
  for (const camp of sending as CampaignRow[]) {
    while (batches < (opts.maxBatches ?? 4)) {
      if (batches++ > 0) await sleep(650); // stay under the provider's request-rate limit
      const r = await processBatch(camp, size);
      summary.sent += r.sent; summary.skipped += r.skipped; summary.failed += r.failed;
      if (r.rateLimited) { summary.rateLimited = true; return summary; }
      if (r.processed === 0) break;
    }
    const { count } = await db.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", camp.id).in("status", ["queued", "sending"]);
    if (!count) {
      await db.from("communication_campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", camp.id).eq("status", "sending");
      summary.completed++;
    }
  }
  return summary;
}
