import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createTemplate } from "@/lib/admin/template-actions";
import { getOrgSettings } from "@/lib/settings";
import { serverEnv } from "@/lib/env";
import { TemplateBuilder } from "@/components/admin/template-builder";

export const dynamic = "force-dynamic";
export const metadata = { title: "New template" };

export default async function NewTemplatePage() {
  await requirePermission("comms.send");
  const settings = await getOrgSettings();
  const from = serverEnv().EMAIL_FROM_ADDRESS;
  return (
    <>
      <p><Link className="underline" href="/admin/messages">← Back to template list</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">New template</h1>
      <p className="mt-2 max-w-prose text-ink-soft">For a custom message sent manually, from a donor&apos;s page or as a gift&apos;s thank-you, or tied to an automatic email afterward under <strong>Used for</strong>.</p>
      <div className="mt-6">
        <TemplateBuilder action={createTemplate} submitLabel="Create template"
          values={{ name: "", replyTo: "", subject: "", bodyHtml: "" }}
          fromAddress={from ? `${settings.email_sender_name} <${from}>` : "Not set up yet (EMAIL_FROM_ADDRESS)"} defaultReplyTo={settings.email_reply_to} />
      </div>
    </>
  );
}
