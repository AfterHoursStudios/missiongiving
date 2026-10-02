import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { archiveFormTemplate } from "@/lib/admin/form-template-actions";
import { formTemplateSchema } from "@/lib/admin/form-template-schema";
import { FormTemplateBuilder } from "@/components/admin/form-template-builder";
import { SimpleForm } from "@/components/donor/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit donation form" };

export default async function EditFormTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.manage");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { data: row } = await createSupabaseAdminClient().from("donation_form_templates").select("*").eq("id", id).maybeSingle();
  if (!row) notFound();
  const parsed = formTemplateSchema.safeParse(row);
  if (!parsed.success) notFound();

  return (
    <>
      <p><Link className="underline" href="/admin/forms">← All forms</Link></p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{row.name}</h1>
        {row.status !== "archived" && <SimpleForm action={archiveFormTemplate} submit="Archive this form" tone="danger">
          <input type="hidden" name="id" value={id} />
        </SimpleForm>}
      </div>
      <div className="mt-6"><FormTemplateBuilder id={id} initial={parsed.data} /></div>
    </>
  );
}
