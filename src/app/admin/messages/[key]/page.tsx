import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { restoreVersion, saveTemplate, sendTestEmail } from "@/lib/admin/template-actions";
import { SAMPLE_VARS } from "@/lib/admin/template-logic";
import { TEMPLATE_VARIABLES, fillTemplate, sanitizeEmailHtml } from "@/lib/messages";
import { SimpleForm, TextInput } from "@/components/donor/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit template" };

export default async function TemplatePage({ params }: { params: Promise<{ key: string }> }) {
  await requirePermission("comms.send");
  const { key } = await params;
  if (!/^[a-z_]+$/.test(key)) notFound();
  const db = createSupabaseAdminClient();
  const { data: t } = await db.from("message_templates").select("id, key, name, subject, body_html, body_text").eq("key", key).maybeSingle();
  if (!t) notFound();
  const { data: versions } = await db.from("message_template_versions").select("id, version, subject, created_at").eq("template_id", t.id).order("version", { ascending: false }).limit(30);

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
            <div><label htmlFor="html" className="block font-semibold">Message (HTML)</label>
              <textarea id="html" name="body_html" rows={10} required defaultValue={t.body_html} className={area + " font-mono text-sm"} />
              <p className="text-sm text-ink-soft">Allowed: p, br, strong, em, h2, h3, ul, ol, li, blockquote, and https links. Everything else is removed when saved.</p></div>
            <div><label htmlFor="text" className="block font-semibold">Plain-text version</label>
              <textarea id="text" name="body_text" rows={5} defaultValue={t.body_text} className={area} />
              <p className="text-sm text-ink-soft">Leave blank to generate from the HTML.</p></div>
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
