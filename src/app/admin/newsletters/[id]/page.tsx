import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Copy } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cancelCampaign, scheduleCampaign, unscheduleCampaign } from "@/lib/comms/campaign-actions";
import { duplicateNewsletter } from "@/lib/comms/newsletter-actions";
import { newsletterDesignSchema, renderNewsletterHtml } from "@/lib/comms/newsletter";
import { newsletterLogoUrl } from "@/lib/comms/render-newsletter";
import { previewAudience, sendingProblems } from "@/lib/comms/send";
import { fillTemplate, sanitizeEmailHtml } from "@/lib/messages";
import { SAMPLE_VARS } from "@/lib/admin/template-logic";
import { publicEnv } from "@/lib/env";
import { getOrgSettings } from "@/lib/settings";
import { SimpleForm, TextInput } from "@/components/donor/forms";
import { NewsletterBuilder, type ProjectChoice } from "@/components/admin/newsletter-builder";
import { DeleteNewsletterDraft } from "@/components/admin/newsletter-row-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletter" };

const REASONS: Record<string, string> = { no_consent: "have News emails turned off", suppressed: "unsubscribed, bounced or blocked", do_not_contact: "are marked Do not contact", no_email: "have no email address", not_matching: "" };

export default async function NewsletterPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("comms.send");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const db = createSupabaseAdminClient();
  const { data: c } = await db.from("communication_campaigns").select("id, subject, status, design, scheduled_for, sent_at, recipient_count, last_error").eq("id", id).maybeSingle();
  if (!c?.design) notFound();
  const settings = await getOrgSettings();
  const parsed = newsletterDesignSchema.safeParse(c.design);
  if (!parsed.success) notFound();
  const design = parsed.data;
  const base = publicEnv.NEXT_PUBLIC_APP_URL;
  const tz = settings.timezone;
  const copy = duplicateNewsletter.bind(null, c.id);

  if (c.status !== "draft") {
    const vars = { ...SAMPLE_VARS, organization_name: settings.brand_name };
    const html = renderNewsletterHtml(design, c.subject, {
      orgName: settings.brand_name, orgAddress: settings.mailing_address, logoUrl: newsletterLogoUrl(),
      fillText: (s) => fillTemplate(s, vars, "text"), clean: (h) => sanitizeEmailHtml(fillTemplate(h, vars, "html")),
      unsubscribeUrl: `${base}/unsubscribe`, preferencesUrl: `${base}/dashboard`,
    });
    return (
      <>
        <p><Link className="underline" href="/admin/newsletters">← All newsletters</Link></p>
        <h1 className="mt-2 text-3xl font-semibold">{c.subject}</h1>
        <p className="mt-1 text-ink-soft">
          {c.status === "sent" ? `Sent ${new Date(c.sent_at ?? c.scheduled_for).toLocaleString("en-US", { timeZone: tz })}` : c.status === "scheduled" ? `Scheduled for ${new Date(c.scheduled_for).toLocaleString("en-US", { timeZone: tz })}` : c.status === "sending" ? "Sending now" : "Canceled"}
          {c.recipient_count ? ` · ${c.recipient_count} recipients` : ""}
        </p>
        {c.last_error && <p role="alert" className="mt-3 rounded-md bg-danger-bg p-3 text-danger">{c.last_error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Link className="inline-flex min-h-11 items-center rounded-md border-2 border-teal-800 px-4 font-semibold text-teal-800 hover:bg-paper-2" href={`/admin/campaigns/${c.id}`}>Delivery and opens</Link>
          <form action={copy}><button className="inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-teal-800 px-4 font-semibold text-teal-800 hover:bg-paper-2"><Copy size={16} aria-hidden="true" />Copy to a new draft</button></form>
          {c.status === "scheduled" && <SimpleForm action={unscheduleCampaign} submit="Return to draft"><input type="hidden" name="id" value={c.id} /></SimpleForm>}
          {(c.status === "scheduled" || c.status === "sending") && <SimpleForm action={cancelCampaign} submit="Cancel newsletter" tone="danger"><input type="hidden" name="id" value={c.id} /></SimpleForm>}
        </div>
        <div className="mt-6 max-w-3xl overflow-hidden rounded-xl border border-line bg-[#eef3f1]">
          <iframe title="Newsletter as sent" sandbox="allow-same-origin" srcDoc={html} className="block h-[80vh] w-full bg-white" />
        </div>
      </>
    );
  }

  const [audience, problems, projects] = await Promise.all([
    previewAudience({ kind: "announcement", audience: {} }),
    sendingProblems(),
    db.from("projects").select("title, summary, featured_image_url, slug").eq("is_public", true).in("status", ["active", "goal_reached", "completed"]).order("title"),
  ]);
  const choices: ProjectChoice[] = (projects.data ?? []).map((p) => ({
    title: p.title, summary: p.summary ?? "", image: /^https:\/\//.test(p.featured_image_url ?? "") ? p.featured_image_url! : "", url: `${base}/projects/${p.slug}`,
  }));
  const excluded = Object.entries(audience.excluded).filter(([k, n]) => n > 0 && REASONS[k]);

  return (
    <>
      <p><Link className="underline" href="/admin/newsletters">← All newsletters</Link></p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Newsletter builder</h1>
        <div className="flex flex-wrap items-center gap-4">
          <form action={copy}><button className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-teal-600 hover:underline"><Copy size={16} aria-hidden="true" />Copy</button></form>
          <DeleteNewsletterDraft id={c.id} />
        </div>
      </div>
      {c.last_error && <p role="alert" className="mt-3 rounded-md bg-danger-bg p-3 text-danger">{c.last_error}</p>}

      <div className="mt-6">
        <NewsletterBuilder id={c.id} initialSubject={c.subject} initialDesign={design} orgName={settings.brand_name} orgAddress={settings.mailing_address} logoUrl={newsletterLogoUrl()} projects={choices} />
      </div>

      <section aria-labelledby="nl-send" className="mt-12 max-w-2xl rounded-xl border-t-4 border-teal-800 bg-white p-5 shadow-sm">
        <h2 id="nl-send" className="text-2xl font-semibold">Send or schedule</h2>
        <p className="mt-2 text-3xl font-semibold text-teal-800" role="status">{audience.count.toLocaleString("en-US")} recipient{audience.count === 1 ? "" : "s"}</p>
        <p className="text-ink-soft">Everyone with News emails turned on.{audience.sample.length > 0 ? ` For example: ${audience.sample.join(", ")}.` : ""}</p>
        {excluded.length > 0 && <ul className="mt-2 list-disc pl-6 text-sm text-ink-soft">{excluded.map(([k, n]) => <li key={k}>{n} left out: they {REASONS[k]}</li>)}</ul>}
        {problems.length > 0 && <ul role="alert" className="mt-3 list-disc rounded-md bg-warning-bg p-3 pl-8 text-warning">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <p className="mt-3 rounded-md bg-paper-2 p-3 text-sm">The saved version is sent. Save your changes and send yourself a test first.</p>
        <div className="mt-4"><SimpleForm action={scheduleCampaign} submit="Confirm and send" tone="danger">
          <input type="hidden" name="id" value={c.id} /><input type="hidden" name="expected" value={audience.count} />
          <fieldset><legend className="font-semibold">When</legend>
            <label className="mr-6 inline-flex min-h-11 items-center"><input type="radio" name="mode" value="now" defaultChecked className="mr-2" />Send now</label>
            <label className="inline-flex min-h-11 items-center"><input type="radio" name="mode" value="later" className="mr-2" />Schedule for later</label></fieldset>
          <div><label htmlFor="when" className="block font-semibold">Date and time ({tz}), if scheduling</label><input id="when" type="datetime-local" name="when" className="mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2" /></div>
          <p className="rounded-md bg-warning-bg p-3 text-warning">You are about to send this newsletter to <strong>{audience.count.toLocaleString("en-US")}</strong> {audience.count === 1 ? "person" : "people"}. It can&apos;t be recalled once sent. Donors who unsubscribe before their copy goes out are skipped.</p>
          <TextInput label="Type SEND to confirm" name="confirm" required />
        </SimpleForm></div>
      </section>
    </>
  );
}
