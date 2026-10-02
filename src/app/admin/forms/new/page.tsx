import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { FormTemplateBuilder } from "@/components/admin/form-template-builder";
import { DEFAULT_TEMPLATE } from "@/lib/admin/form-template-schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "New donation form" };

export default async function NewFormTemplatePage() {
  await requirePermission("projects.manage");
  return (
    <>
      <p><Link className="underline" href="/admin/forms">← All forms</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">New donation form</h1>
      <div className="mt-6"><FormTemplateBuilder initial={DEFAULT_TEMPLATE} /></div>
    </>
  );
}
