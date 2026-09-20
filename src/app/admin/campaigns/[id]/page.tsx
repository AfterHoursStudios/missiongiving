import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cancelCampaign, scheduleCampaign, sendCampaignTest, unscheduleCampaign } from "@/lib/comms/campaign-actions";
import { previewAudience, sendingProblems } from "@/lib/comms/send";
import { CampaignForm } from "@/components/admin/campaign-form";
import { SimpleForm, TextInput } from "@/components/donor/forms";
import { getOrgSettings } from "@/lib/settings";
import { SAMPLE_VARS } from "@/lib/admin/template-logic";
import { fillTemplate, sanitizeEmailHtml } from "@/lib/messages";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaign" };

const REASONS: Record<string, string> = { no_consent: "did not opt in", suppressed: "suppressed (bounce, complaint or blocked)", do_not_contact: "marked do-not-contact", no_email: "no email address", not_matching: "did not match your filters" };
const EVENTS = ["sent", "delivered", "bounced", "complained", "opened", "clicked", "unsubscribed"] as const;

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("comms.send");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const db = createSupabaseAdminClient();
  const { data: c } = await db.from("communication_campaigns").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const settings = await getOrgSettings();
  const [{ data: projects }, { data: tags }, { data: who }] = await Promise.all([
    db.from("projects").select("id, title").neq("status", "archived").order("title"),
    db.from("donor_tags").select("id, name").order("name"),
    db.from("profiles").select("id, email").in("id", [c.authorized_by, c.created_by].filter(Boolean)),
  ]);
  const email = (uid: string | null) => who?.find((w) => w.id === uid)?.email ?? "—";
  const draft = c.status === "draft";

  return (
    <>
      <p><Link className="underline" href="/admin/campaigns">← All campaigns</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">{c.subject}</h1>
      <p className="text-ink-soft">Status: <strong>{c.status}</strong> · created by {email(c.created_by)}{c.authorized_by ? ` · authorized by ${email(c.authorized_by)}` : ""}{c.scheduled_for ? ` · ${c.status === "scheduled" ? "scheduled for" : "started"} ${new Date(c.scheduled_for).toLocaleString("en-US", { timeZone: settings.timezone })}` : ""}</p>
      {c.last_error && <p role="alert" className="mt-3 rounded-md bg-danger-bg p-3 text-danger">{c.last_error}</p>}

      {draft ? <Draft c={c} projects={projects ?? []} tags={tags ?? []} settings={settings} /> : <Delivery c={c} settings={settings} />}
    </>
  );
}

async function Draft({ c, projects, tags, settings }: { c: { id: string; kind: "announcement" | "project_update"; audience: unknown; subject: string; body_html: string; project_id: string | null }; projects: { id: string; title: string }[]; tags: { id: string; name: string }[]; settings: Awaited<ReturnType<typeof getOrgSettings>> }) {
  const [preview, problems] = await Promise.all([previewAudience(c), sendingProblems()]);
  const previewHtml = sanitizeEmailHtml(fillTemplate(c.body_html, { ...SAMPLE_VARS, organization_name: settings.brand_name }, "html"));
  const excludedTotal = Object.entries(preview.excluded).filter(([, n]) => n > 0);
  return (
    <>
      <div className="mt-8 max-w-2xl"><CampaignForm campaign={{ ...c, audience: c.audience as never }} projects={projects} tags={tags} /></div>

      <section aria-labelledby="aud" className="mt-12 max-w-2xl">
        <h2 id="aud" className="text-2xl font-semibold">3. Recipients</h2>
        <p className="mt-2 text-3xl font-semibold text-brand-800" role="status">{preview.count} recipient{preview.count === 1 ? "" : "s"}</p>
        {preview.sample.length > 0 && <p className="text-sm text-ink-soft">For example: {preview.sample.join(", ")}</p>}
        {excludedTotal.length > 0 && <ul className="mt-2 list-disc pl-6 text-sm text-ink-soft">{excludedTotal.map(([k, n]) => <li key={k}>{n} {REASONS[k] ?? k}</li>)}</ul>}
        <p className="mt-2 text-sm text-ink-soft">Saved filters are used. Save the draft after changing them to refresh this count.</p>
      </section>

      <section aria-labelledby="prev" className="mt-12 max-w-2xl">
        <h2 id="prev" className="text-2xl font-semibold">4. Preview and 5. Test</h2>
        <p className="mt-2 font-semibold">Subject: {fillTemplate(c.subject, SAMPLE_VARS, "text")}</p>
        <div className="mt-2 space-y-3 border border-line bg-white p-4" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        <p className="mt-2 text-sm text-ink-soft">Sample data shown. Each recipient also gets a footer with the mailing address and an unsubscribe link.</p>
        <div className="mt-4"><SimpleForm action={sendCampaignTest} submit="Send test email to me"><input type="hidden" name="id" value={c.id} /></SimpleForm></div>
      </section>

      <section aria-labelledby="send" className="mt-12 max-w-2xl border-t-4 border-brand-700 pt-6">
        <h2 id="send" className="text-2xl font-semibold">6. Schedule or send, and 7. Confirm</h2>
        {problems.length > 0 && <ul role="alert" className="mt-3 list-disc rounded-md bg-warning-bg p-3 pl-8 text-warning">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <div className="mt-4"><SimpleForm action={scheduleCampaign} submit="Confirm and send" tone="danger">
          <input type="hidden" name="id" value={c.id} /><input type="hidden" name="expected" value={preview.count} />
          <fieldset><legend className="font-semibold">When</legend>
            <label className="mr-6"><input type="radio" name="mode" value="now" defaultChecked className="mr-2" />Send now</label>
            <label><input type="radio" name="mode" value="later" className="mr-2" />Schedule for later</label></fieldset>
          <div><label htmlFor="when" className="block font-semibold">Date and time ({settings.timezone}), if scheduling</label><input id="when" type="datetime-local" name="when" className="mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2" /></div>
          <p className="rounded-md bg-paper-2 p-3">You are about to authorize sending <strong>{preview.count}</strong> email{preview.count === 1 ? "" : "s"}. This cannot be undone once sent. Donors who unsubscribe before their message goes out are skipped automatically.</p>
          <TextInput label="Type SEND to confirm" name="confirm" required />
        </SimpleForm></div>
      </section>
    </>
  );
}

async function Delivery({ c, settings }: { c: { id: string; status: string; recipient_count: number | null }; settings: Awaited<ReturnType<typeof getOrgSettings>> }) {
  const db = createSupabaseAdminClient();
  const [{ data: ev }, { data: st }] = await Promise.all([
    db.from("campaign_stats").select("event_type, recipients").eq("campaign_id", c.id),
    db.from("campaign_recipient_status").select("status, recipients").eq("campaign_id", c.id),
  ]);
  const events = Object.fromEntries((ev ?? []).map((e) => [e.event_type, e.recipients as number]));
  const status = Object.fromEntries((st ?? []).map((s) => [s.status, s.recipients as number]));
  const delivered = events.delivered ?? 0;
  const pct = (n = 0) => (delivered ? ` (${Math.round((n / delivered) * 1000) / 10}% of delivered)` : "");
  void settings;
  return (
    <>
      {(c.status === "scheduled" || c.status === "sending") && (
        <div className="mt-6 flex flex-wrap gap-6">
          {c.status === "scheduled" && <SimpleForm action={unscheduleCampaign} submit="Return to draft"><input type="hidden" name="id" value={c.id} /></SimpleForm>}
          <SimpleForm action={cancelCampaign} submit="Cancel campaign" tone="danger"><input type="hidden" name="id" value={c.id} /></SimpleForm>
        </div>
      )}
      <section aria-labelledby="stats" className="mt-10">
        <h2 id="stats" className="text-2xl font-semibold">Delivery</h2>
        <p className="text-sm text-ink-soft">Recipients: {c.recipient_count ?? 0}. Counts are people, updated as the email provider reports events.</p>
        <dl className="mt-4 grid grid-cols-2 gap-6 md:grid-cols-4">
          {(["queued", "sending", "sent", "skipped", "failed"] as const).map((k) => <div key={k}><dt className="text-sm text-ink-soft">{k === "sent" ? "Handed to provider" : k[0].toUpperCase() + k.slice(1)}</dt><dd className="font-display text-3xl font-semibold text-brand-800">{status[k] ?? 0}</dd></div>)}
        </dl>
        <h3 className="mt-8 text-xl font-semibold">Engagement</h3>
        <dl className="mt-3 grid grid-cols-2 gap-6 md:grid-cols-4">
          {EVENTS.map((k) => <div key={k}><dt className="text-sm text-ink-soft">{k[0].toUpperCase() + k.slice(1)}</dt><dd className="font-display text-3xl font-semibold text-brand-800">{events[k] ?? 0}</dd>{["opened", "clicked"].includes(k) && <p className="text-xs text-ink-soft">{pct(events[k])}</p>}</div>)}
        </dl>
        <p className="mt-4 max-w-prose text-sm text-ink-soft">Open counts are approximate: they need tracking enabled for your sending domain in Resend, and privacy features in some mail apps inflate them. Skipped recipients unsubscribed, were suppressed, or lost consent before their message went out.</p>
      </section>
    </>
  );
}
