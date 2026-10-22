import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { slugify } from "./project-schema";

type Db = ReturnType<typeof createSupabaseAdminClient>;

/**
 * "+ New designation" on the Add gift forms: creates a bare project (a draft, not public) with its own restricted fund,
 * like Projects → New does, and a to-do for the staff member to fill in its details later. A designation with the same
 * name that already exists is reused instead of duplicated. Returns the project and fund to record the gift against.
 */
export async function createQuickDesignation(db: Db, userId: string, rawTitle: string): Promise<{ projectId: string; fundId: string | null } | { error: string }> {
  const title = rawTitle.trim().replace(/\s+/g, " ");
  if (title.length < 2 || title.length > 120) return { error: "Give the new designation a name (2 to 120 characters)." };

  const { data: existing } = await db.from("projects").select("id, fund_id").ilike("title", title.replace(/[%_\\]/g, "\\$&")).neq("status", "archived").limit(1);
  if (existing?.[0]) return { projectId: existing[0].id, fundId: existing[0].fund_id };

  const base = slugify(title) || "designation";
  let slug = base;
  for (let n = 2; (await db.from("projects").select("id").eq("slug", slug).maybeSingle()).data; n++) slug = `${base}-${n}`;

  const { data: fund, error: fundErr } = await db.from("funds").insert({ key: `project-${slug}`, name: title, restriction: "restricted" }).select("id").single();
  if (fundErr || !fund) return { error: "Could not create the new designation's fund." };
  const { data: project, error } = await db.from("projects")
    .insert({ title, slug, fund_id: fund.id, status: "draft", is_public: false, created_by: userId }).select("id").single();
  if (error || !project) {
    await db.from("funds").delete().eq("id", fund.id); // nothing references it yet
    return { error: "Could not create the new designation." };
  }
  await audit(userId, "settings.change", "project", project.id, { created: "quick_designation", title });

  // A reminder to finish the project. Best effort: the gift still records if the to-do can't be saved.
  const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const todo = await db.from("donor_todos").insert({
    donor_id: null, activity: "task", title: `Add details for the new designation "${title}"`.slice(0, 200), due_date: due,
    assigned_to: userId, created_by: userId,
    notes: `Created while entering a gift. Open Projects → ${title} (/admin/projects/${project.id}) to add a summary, story, picture and goal, then decide whether it should be public.`,
  });
  if (todo.error) console.error("[quick-designation] could not create the to-do", todo.error.code);
  return { projectId: project.id, fundId: fund.id };
}
