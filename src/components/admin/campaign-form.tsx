import { SimpleForm, TextInput } from "@/components/donor/forms";
import { saveCampaign } from "@/lib/comms/campaign-actions";
import type { AudienceFilters } from "@/lib/comms/audience";

export interface CampaignValues {
  id?: string; kind?: string; project_id?: string | null; donation_form_template_id?: string | null; subject?: string; body_html?: string; audience?: Partial<AudienceFilters> | null;
}
const sel = "mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-2";

export function CampaignForm({ campaign, projects, tags, formTemplates = [] }: {
  campaign?: CampaignValues; projects: { id: string; title: string }[]; tags: { id: string; name: string }[]; formTemplates?: { id: string; name: string }[];
}) {
  const c = campaign ?? { kind: "announcement" };
  const a = c.audience ?? {};
  return (
    <SimpleForm action={saveCampaign} submit={campaign?.id ? "Save draft" : "Create draft"}>
      {campaign?.id && <input type="hidden" name="id" value={campaign.id} />}

      <fieldset className="space-y-4">
        <legend className="text-2xl font-semibold">1. Audience</legend>
        <p className="text-sm text-ink-soft">Only donors who opted in are ever included. Filters narrow that group; they can never widen it.</p>
        <div><label htmlFor="kind" className="block font-semibold">Type of message</label>
          <select id="kind" name="kind" defaultValue={c.kind} className={sel}>
            <option value="announcement">Announcement or news (needs the donor&apos;s &ldquo;news&rdquo; consent)</option>
            <option value="project_update">Project update (needs the donor&apos;s &ldquo;project updates&rdquo; consent)</option>
          </select></div>
        <div><label htmlFor="project_id" className="block font-semibold">Related project (optional; fills {"{{project_name}}"})</label>
          <select id="project_id" name="project_id" defaultValue={c.project_id ?? ""} className={sel}><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
        <div><label htmlFor="donation_form_template_id" className="block font-semibold">Donation form for this campaign&apos;s links (optional)</label>
          <select id="donation_form_template_id" name="donation_form_template_id" defaultValue={c.donation_form_template_id ?? ""} className={sel}>
            <option value="">Use the related project&apos;s form, or the default</option>
            {formTemplates.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <p className="text-sm text-ink-soft">Only used if the message links to <code>/donate?campaign={c.id ?? "…"}</code> instead of the project page (the campaign&apos;s id is shown once it is saved).</p></div>
        <fieldset><legend className="font-semibold">Recurring donors</legend>
          <label className="mr-6"><input type="checkbox" name="frequencies" value="monthly" defaultChecked={a.frequencies?.includes("monthly")} className="mr-2 size-5 align-middle" />Monthly donors</label>
          <label><input type="checkbox" name="frequencies" value="yearly" defaultChecked={a.frequencies?.includes("yearly")} className="mr-2 size-5 align-middle" />Yearly donors</label></fieldset>
        <div><label htmlFor="project_ids" className="block font-semibold">Previous donors of these projects</label>
          <select id="project_ids" name="project_ids" multiple size={Math.min(5, Math.max(2, projects.length))} defaultValue={a.project_ids ?? []} className="mt-1.5 w-full rounded-md border border-ink-soft bg-white px-2">{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
          <p className="text-sm text-ink-soft">Hold Ctrl or Cmd to choose several. Leave empty for no project filter.</p></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label="Not given in the last (months)" name="lapsed_months" defaultValue={a.lapsed_months ? String(a.lapsed_months) : ""} hint="Only donors who have given before." />
          <TextInput label="Lifetime giving at least ($)" name="min_lifetime" defaultValue={a.min_lifetime !== undefined ? String(a.min_lifetime) : ""} />
          <TextInput label="Lifetime giving at most ($)" name="max_lifetime" defaultValue={a.max_lifetime !== undefined ? String(a.max_lifetime) : ""} />
        </div>
        <div><label htmlFor="tag_ids" className="block font-semibold">Tagged with any of</label>
          <select id="tag_ids" name="tag_ids" multiple size={Math.min(5, Math.max(2, tags.length))} defaultValue={a.tag_ids ?? []} className="mt-1.5 w-full rounded-md border border-ink-soft bg-white px-2">{tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <TextInput label="State or region (exact match)" name="region" defaultValue={a.region} hint="Use only where you have a lawful basis to segment by location." />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mt-8 text-2xl font-semibold">2. Message</legend>
        <TextInput label="Subject line" name="subject" defaultValue={c.subject} required />
        <div><label htmlFor="body_html" className="block font-semibold">Message (HTML)</label>
          <textarea id="body_html" name="body_html" rows={12} required defaultValue={c.body_html} className="mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2 font-mono text-sm" />
          <p className="text-sm text-ink-soft">Variables: {"{{donor_first_name}}"}, {"{{donor_full_name}}"}, {"{{project_name}}"}, {"{{organization_name}}"}, {"{{dashboard_link}}"}. Allowed HTML: p, br, strong, em, h2, h3, ul, ol, li, blockquote, and https links. An unsubscribe link and your mailing address are added automatically.</p></div>
      </fieldset>
    </SimpleForm>
  );
}
