import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Message templates" };

export default async function MessagesPage() {
  await requirePermission("comms.send");
  const { data } = await createSupabaseAdminClient().from("message_templates").select("key, name, subject, updated_at").order("name");
  return (
    <>
      <h1 className="text-3xl font-semibold">Message templates</h1>
      <p className="mt-2 max-w-prose text-ink-soft">Transactional and announcement wording. Edits are versioned and can be restored. A donation tier&apos;s own email message overrides the success-email body.</p>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {(data ?? []).map((t) => (
          <li key={t.key} className="py-3"><Link className="font-semibold underline" href={`/admin/messages/${t.key}`}>{t.name}</Link><span className="block text-sm text-ink-soft">Subject: {t.subject}</span></li>
        ))}
        {(data ?? []).length === 0 && <li className="py-6 text-center text-ink-soft">No templates. Run supabase/seed.sql.</li>}
      </ul>
    </>
  );
}
