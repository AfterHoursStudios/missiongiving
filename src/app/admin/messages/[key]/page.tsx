import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { restoreVersion, saveTemplate, sendTestEmail } from "@/lib/admin/template-actions";
import { htmlToEditableText } from "@/lib/admin/project-schema";
import { SAMPLE_VARS } from "@/lib/admin/template-logic";
import { TEMPLATE_VARIABLES, fillTemplate, sanitizeEmailHtml } from "@/lib/messages";
import { SimpleForm, TextInput } from "@/components/donor/forms";
import { TemplateUsageForm } from "@/components/admin/template-usage-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit template" };

export default async function TemplatePage({ params }: { params: Promise<{ key: string }> }) {
  await requirePermission("comms.send");
  const { key } = await params;
  if (!/^[a-z_]+$/.test(key)) notFound();
  const db = createSupabaseAdminClient();
  const { data: t } = await db.from("message_templates").select("id, key, name, subject, body_html, body_text").eq("key", key).maybeSingle();
  if (!t) notFound();
  const [{ data: versions }, assignments] = await Promise.all([
    db.from("message_template_versions").select("id, version, subject, created_at").eq("template_id", t.id).order("version", { ascending: false }).limit(30),
    db.from("message_assignments").select("event, template_id, message_templates(name)"),
  ]);
  const usageReady = !assignments.error; // false until migration 0020 is applied
  const rows = assignments.data ?? [];
  const checked = rows.filter((a) => a.template_id === t.id).map((a) => a.event as string);
  const others = Object.fromEntries(rows.filter((a) => a.template_id !== t.id).map((a) => {
    const m = a.message_templates as { name: string } | { name: string }[] | null;
    return [a.event as string, (Array.isArray(m) ? m[0]?.name : m?.name) ?? "another template"];
  }));

  const previewHtml = sanitizeEmailHtml(fillTemplate(t.body_html, SAMPLE_VARS, "html"));
  const area = "mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2";
  return (
    <>
      <p><Link className="underline" href="/admin/messages">← All templates</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">{t.name}</h1>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="edit">
          <h2 id="edit" className="text-2xl font-semibold">Edit</h2>
          <div className="mt-4"><SimpleForm action={saveTemplate} submit="Save new version">
            <input type="hidden" name="key" value={t.key} />
            <TextInput label="Subject line" name="subject" defaultValue={t.subject} required />
            <div><label htmlFor="body" className="block font-semibold">Message</label>
              <textarea id="body" name="body" rows={10} required defaultValue={htmlToEditableText(t.body_html)} className={area} />
              <p className="text-sm text-ink-soft">Plain text: press Enter twice for a new paragraph, once for a line break, and start lines with &quot;- &quot; for a bulleted list.</p></div>
          </SimpleForm></div>
          <p className="mt-4 text-sm"><strong>Variables:</strong> {TEMPLATE_VARIABLES.map((v) => <code key={v} className="mr-2">{`{{${v}}}`}</code>)}</p>
        </section>

        <section aria-labelledby="prev">
          <h2 id="prev" className="text-2xl font-semibold">Preview (saved version, sample data)</h2>
          <p className="mt-3 font-semibold">Subject: {fillTemplate(t.subject, SAMPLE_VARS, "text")}</p>
          <div className="mt-2 space-y-3 border border-line bg-white p-4" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          <details className="mt-3"><summary className="cursor-pointer font-semibold underline">Plain-text version</summary><pre className="mt-2 whitespace-pre-wrap text-sm">{fillTemplate(t.body_text, SAMPLE_VARS, "text")}</pre></details>
          <div className="mt-4"><SimpleForm action={sendTestEmail} submit="Send test email to me"><input type="hidden" name="key" value={t.key} /></SimpleForm></div>
        </section>
      </div>

      <section aria-labelledby="usage" className="mt-12 max-w-2xl">
        <h2 id="usage" className="text-2xl font-semibold">Used for</h2>
        <p className="mt-1 text-ink-soft">The emails the site sends automatically with this template. Untick everything to use it only for <strong>Send Email</strong> on a donor&apos;s record.</p>
        {usageReady
          ? <div className="mt-4"><TemplateUsageForm templateKey={t.key} checked={checked} others={others} /></div>
          : <p className="mt-3 rounded-md bg-warning-bg p-3 text-warning">Apply database migration 0020 (message_assignments) to choose what this template is used for.</p>}
      </section>

      <section aria-labelledby="hist" className="mt-12 max-w-2xl">
        <h2 id="hist" className="text-2xl font-semibold">Version history</h2>
        {(versions ?? []).length === 0 ? <p className="mt-2 text-ink-soft">No saved versions yet. The first save records the original as version 1.</p> : (
          <ul className="mt-3 divide-y divide-line border-y border-line">{(versions ?? []).map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>Version {v.version} · {new Date(v.created_at).toLocaleString("en-US")}<span className="block text-sm text-ink-soft">{v.subject}</span></span>
              <SimpleForm action={restoreVersion} submit="Restore"><input type="hidden" name="key" value={t.key} /><input type="hidden" name="versionId" value={v.id} /></SimpleForm>
            </li>))}</ul>
        )}
      </section>
    </>
  );
}
