import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { addProjectUpdate, adjustOffline } from "@/lib/admin/project-actions";
import { ProjectForm } from "@/components/admin/project-form";
import { CheckInput, SimpleForm, TextInput } from "@/components/donor/forms";
import { formatMoney, projectProgress } from "@/lib/money";
import { StatCard, StatusDot } from "@/components/donor/ui";
import { DollarSign, Target, Users } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { perms } = await requirePermission("projects.manage");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const db = createSupabaseAdminClient();
  const { data: project } = await db.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();
  const [{ data: totals }, { data: updates }, { data: forms }] = await Promise.all([
    db.rpc("project_totals", { p_project_id: id }),
    db.from("project_updates").select("id, title, published_at, created_at").eq("project_id", id).order("created_at", { ascending: false }),
    db.from("donation_form_templates").select("id, name").eq("status", "active").order("name"),
  ]);
  const raised = Number(totals?.[0]?.raised_cents ?? 0);
  const pr = projectProgress(raised, project.offline_adjustment_cents, project.goal_cents);

  return (
    <>
      <p><Link className="underline" href="/admin/projects">← All projects</Link></p>

      <div className="mt-3 rounded-lg border border-line border-l-4 border-l-brand-700 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold">{project.title}</h1>
            <div className="mt-1"><StatusDot status={project.status} /></div>
            {project.is_public && ["active", "goal_reached", "completed"].includes(project.status) && (
              <p className="mt-2"><Link className="underline" href={`/projects/${project.slug}`}>View public page</Link></p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <StatCard icon={DollarSign} tone="success" label="Raised" value={formatMoney(pr.raised)} hint={project.goal_cents ? `${pr.pct}% of goal` : undefined} />
            <StatCard icon={Target} tone="gold" label="Goal" value={project.goal_cents ? formatMoney(project.goal_cents) : "No goal set"} />
            <StatCard icon={Users} tone="brand" label="Donors" value={String(Number(totals?.[0]?.donor_count ?? 0))} />
          </div>
        </div>
      </div>

      {["active", "goal_reached", "completed"].includes(project.status) && !project.is_public && (
        <p role="alert" className="mt-4 rounded-md bg-warning-bg p-3 text-warning"><strong>Not visible to the public.</strong> This project is {project.status.replace("_", " ")} but the Public box is unchecked, so it does not appear on the website or in the donate flow. Tick <em>Public</em> below and save.</p>
      )}

      {perms.has("comms.send") && <p className="mt-3"><Link className="font-semibold underline" href={`/admin/campaigns/new?project=${id}`}>Create an announcement for donors</Link> <span className="text-sm text-ink-soft">(starts a draft; you preview and confirm before anything is sent)</span></p>}

      <div className="mt-8 max-w-2xl"><ProjectForm project={project} formTemplates={forms ?? []} /></div>

      <section className="mt-14 max-w-2xl" aria-labelledby="upd">
        <h2 id="upd" className="text-2xl font-semibold">Project updates</h2>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {(updates ?? []).map((u) => <li key={u.id} className="py-2">{u.title} <span className="text-sm text-ink-soft">{u.published_at ? `published ${new Date(u.published_at).toLocaleDateString("en-US")}` : "draft"}</span></li>)}
          {(updates ?? []).length === 0 && <li className="py-2 text-ink-soft">No updates yet.</li>}
        </ul>
        <div className="mt-4"><SimpleForm action={addProjectUpdate} submit="Save update">
          <input type="hidden" name="projectId" value={id} />
          <TextInput label="Update title" name="title" required />
          <div><label htmlFor="ubody" className="block font-semibold">Update text (basic HTML allowed)</label>
            <textarea id="ubody" name="body" rows={5} required className="mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2" /></div>
          <CheckInput label="Publish now (unchecked saves a draft)" name="publish" />
        </SimpleForm></div>
      </section>

      <section className="mt-14 max-w-2xl" aria-labelledby="off">
        <h2 id="off" className="text-2xl font-semibold">Offline amount adjustment</h2>
        <p className="text-sm text-ink-soft">Adds gifts received outside the site (checks, cash) to this project&apos;s total. Every adjustment needs an explanation and is recorded in the audit log. Current adjustment: {formatMoney(project.offline_adjustment_cents)}.</p>
        {project.offline_adjustment_note && <pre className="mt-3 whitespace-pre-wrap rounded-md bg-paper-2 p-3 text-sm">{project.offline_adjustment_note}</pre>}
        <div className="mt-4"><SimpleForm action={adjustOffline} submit="Record adjustment">
          <input type="hidden" name="id" value={id} />
          <TextInput label="Amount (USD; negative to correct)" name="amount" required />
          <TextInput label="Explanation" name="note" required />
        </SimpleForm></div>
      </section>
    </>
  );
}
