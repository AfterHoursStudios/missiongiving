import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { ProjectForm } from "@/components/admin/project-form";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requirePermission("projects.manage");
  const { data: forms } = await createSupabaseAdminClient().from("donation_form_templates").select("id, name").eq("status", "active").order("name");
  return (
    <>
      <p><Link className="underline" href="/admin/projects">← All projects</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">New project</h1>
      <div className="mt-6 max-w-2xl"><ProjectForm formTemplates={forms ?? []} /></div>
    </>
  );
}
