import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formTemplateSchema, type FormTemplateInput } from "@/lib/admin/form-template-schema";

export interface ResolvedTemplate extends FormTemplateInput { id: string }

/**
 * Which donation form template applies to a "Donate now" link: an email campaign's own choice, else its project's,
 * else the chosen project's own choice, else the org-wide default. Never throws — before migration
 * 0011_donation_form_templates.sql is applied (or on any other read error) donors just see the classic, unstyled flow.
 */
export async function resolveFormTemplate(opts: { projectId?: string | null; campaignId?: string | null }): Promise<ResolvedTemplate | null> {
  try {
    const db = createSupabaseAdminClient();
    let templateId: string | null = null;

    if (opts.campaignId) {
      const { data: campaign } = await db.from("communication_campaigns").select("donation_form_template_id, project_id").eq("id", opts.campaignId).maybeSingle();
      templateId = campaign?.donation_form_template_id ?? null;
      if (!templateId && campaign?.project_id) {
        const { data: project } = await db.from("projects").select("donation_form_template_id").eq("id", campaign.project_id).maybeSingle();
        templateId = project?.donation_form_template_id ?? null;
      }
    }
    if (!templateId && opts.projectId) {
      const { data: project } = await db.from("projects").select("donation_form_template_id").eq("id", opts.projectId).maybeSingle();
      templateId = project?.donation_form_template_id ?? null;
    }
    if (!templateId) {
      const { data: def } = await db.from("donation_form_templates").select("id").eq("is_default", true).eq("status", "active").maybeSingle();
      templateId = def?.id ?? null;
    }
    if (!templateId) return null;

    const { data: row } = await db.from("donation_form_templates").select("*").eq("id", templateId).eq("status", "active").maybeSingle();
    if (!row) return null;
    const parsed = formTemplateSchema.safeParse(row);
    return parsed.success ? { ...parsed.data, id: row.id as string } : null;
  } catch {
    return null;
  }
}

/** One active form template by id (embed codes name their form directly). Null if missing, archived or unreadable. */
export async function formTemplateById(id: string): Promise<ResolvedTemplate | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  try {
    const { data: row } = await createSupabaseAdminClient().from("donation_form_templates").select("*").eq("id", id).eq("status", "active").maybeSingle();
    if (!row) return null;
    const parsed = formTemplateSchema.safeParse(row);
    return parsed.success ? { ...parsed.data, id: row.id as string } : null;
  } catch {
    return null;
  }
}
