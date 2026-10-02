import Link from "next/link";
import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";
import { EmbedCodeButton } from "@/components/admin/embed-code-dialog";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { setDefaultFormTemplate } from "@/lib/admin/form-template-actions";
import { SimpleForm } from "@/components/donor/forms";
import { Badge, StatusDot } from "@/components/donor/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Donation forms" };

export default async function FormTemplatesPage() {
  await requirePermission("projects.manage");
  // The site's public address for embed codes: the configured app URL, else the address this page was opened at.
  const h = await headers();
  const origin = publicEnv.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { data, error } = await createSupabaseAdminClient().from("donation_form_templates")
    .select("id, name, status, is_default").neq("status", "archived").order("name");

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Donation forms</h1>
        <Link href="/admin/forms/new" className="min-h-11 rounded-md bg-brand-700 px-5 py-2.5 font-semibold text-white">New form</Link>
      </div>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">
        Build the branding, content and donor fields shown when someone gives. Assign a form to a project (in Projects) or an
        email campaign (in Campaigns); a plain <Link className="underline" href="/donate">Donate now</Link> link with no
        project or campaign uses whichever form is marked default below. Amounts, tiers and payment always work the same
        regardless of which form is shown.
      </p>
      {error && <p role="alert" className="mt-4 rounded-md bg-danger-bg p-3 text-danger">Could not load forms. Has the database migration <code>0011_donation_form_templates.sql</code> been applied?</p>}
      {!error && (data ?? []).length === 0 ? <p className="mt-8 border-y border-line py-10 text-center text-ink-soft">No forms yet.</p> : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {(data ?? []).map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span>
                <Link className="font-semibold underline" href={`/admin/forms/${f.id}`}>{f.name}</Link>
                {f.is_default && <span className="ml-2"><Badge tone="gold">Default</Badge></span>}
                <span className="block text-sm"><StatusDot status={f.status} /></span>
              </span>
              <span className="flex flex-wrap items-center gap-3">
                {f.status === "active" && <EmbedCodeButton formId={f.id} formName={f.name} origin={origin} />}
                {!f.is_default && <SimpleForm action={setDefaultFormTemplate} submit="Make default"><input type="hidden" name="id" value={f.id} /></SimpleForm>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
