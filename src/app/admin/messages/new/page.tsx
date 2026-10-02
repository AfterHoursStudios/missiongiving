import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createTemplate } from "@/lib/admin/template-actions";
import { TEMPLATE_VARIABLES } from "@/lib/messages";
import { SimpleForm, TextInput } from "@/components/donor/forms";

export const metadata = { title: "New template" };

export default async function NewTemplatePage() {
  await requirePermission("comms.send");
  const area = "mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2";
  return (
    <>
      <p><Link className="underline" href="/admin/messages">← All templates</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">New template</h1>
      <p className="mt-2 max-w-prose text-ink-soft">For a custom message sent manually — from a donor&apos;s page, for example — not one tied to an automatic event.</p>

      <div className="mt-6 max-w-2xl">
        <SimpleForm action={createTemplate} submit="Create template">
          <TextInput label="Name" name="name" hint="Shown in the template list; also used to generate the URL." required />
          <TextInput label="Subject line" name="subject" required />
          <div><label htmlFor="body" className="block font-semibold">Message</label>
            <textarea id="body" name="body" rows={10} required className={area} />
            <p className="text-sm text-ink-soft">Plain text: press Enter twice for a new paragraph, once for a line break, and start lines with &quot;- &quot; for a bulleted list.</p></div>
        </SimpleForm>
        <p className="mt-4 text-sm"><strong>Variables:</strong> {TEMPLATE_VARIABLES.map((v) => <code key={v} className="mr-2">{`{{${v}}}`}</code>)}</p>
      </div>
    </>
  );
}
