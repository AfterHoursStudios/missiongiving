import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { AUTOMATIC_EMAILS } from "@/lib/comms/automatic-emails";

export const dynamic = "force-dynamic";
export const metadata = { title: "Message templates" };

export default async function MessagesPage() {
  await requirePermission("comms.send");
  const db = createSupabaseAdminClient();
  const [{ data }, assignments] = await Promise.all([
    db.from("message_templates").select("id, key, name, subject, updated_at").order("name"),
    db.from("message_assignments").select("event, template_id"),
  ]);
  const usageReady = !assignments.error;
  const byEvent = new Map((assignments.data ?? []).map((a) => [a.event as string, a.template_id as string]));
  const byKey = new Map((data ?? []).map((t) => [t.key, t]));
  // What each automatic email will use: its assigned template, else a template whose key matches (original behaviour).
  const resolved = AUTOMATIC_EMAILS.map((e) => {
    const t = (data ?? []).find((x) => x.id === byEvent.get(e.event)) ?? byKey.get(e.event) ?? null;
    return { ...e, template: t };
  });
  const usedFor = (id: string) => resolved.filter((r) => r.template?.id === id).map((r) => r.label);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Message templates</h1>
        <Link className="min-h-11 inline-flex items-center rounded-md bg-brand-700 px-4 py-2 font-semibold text-white" href="/admin/messages/new">New template</Link>
      </div>
      <p className="mt-2 max-w-prose text-ink-soft">Transactional and announcement wording. Edits are versioned and can be restored. A donation tier&apos;s own email message overrides the success-email body.</p>
      <section aria-labelledby="auto" className="mt-6 max-w-3xl rounded-lg border border-line bg-white p-4 shadow-sm">
        <h2 id="auto" className="text-xl font-semibold">Automatic emails</h2>
        <p className="mt-1 text-sm text-ink-soft">Sent by the site on its own. To change which template one uses, open the template and tick it under <strong>Used for</strong>.</p>
        {!usageReady && <p className="mt-2 rounded-md bg-warning-bg p-2 text-sm text-warning">Apply database migration 0020 (message_assignments) to choose templates here.</p>}
        <ul className="mt-3 divide-y divide-line">
          {resolved.map((r) => (
            <li key={r.event} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
              <span><span className="font-semibold">{r.label}</span><span className="block text-sm text-ink-soft">{r.hint}</span></span>
              {r.template
                ? <Link className="font-semibold text-teal-600 hover:underline" href={`/admin/messages/${r.template.key}`}>{r.template.name}</Link>
                : <span className="font-semibold text-danger">Not set — no email is sent</span>}
            </li>
          ))}
        </ul>
      </section>

      <h2 className="mt-8 text-2xl font-semibold">Templates</h2>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {(data ?? []).map((t) => {
          const uses = usedFor(t.id);
          return (
            <li key={t.key} className="py-3">
              <Link className="font-semibold underline" href={`/admin/messages/${t.key}`}>{t.name}</Link>
              <span className="block text-sm text-ink-soft">Subject: {t.subject}</span>
              <span className="block text-sm">{uses.length ? <>Used for: {uses.join(", ")}</> : <span className="text-ink-soft">Manual only (Send Email on a donor&apos;s record)</span>}</span>
            </li>
          );
        })}
        {(data ?? []).length === 0 && <li className="py-6 text-center text-ink-soft">No templates yet. Create one with New template.</li>}
      </ul>
    </>
  );
}
