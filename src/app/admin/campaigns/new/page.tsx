import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CampaignForm, type CampaignValues } from "@/components/admin/campaign-form";
import { publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "New campaign" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  await requirePermission("comms.send");
  const db = createSupabaseAdminClient();
  const sp = await searchParams;
  const [{ data: projects }, { data: tags }] = await Promise.all([
    db.from("projects").select("id, title, slug, summary").neq("status", "archived").order("title"),
    db.from("donor_tags").select("id, name").order("name"),
  ]);

  // Announcing a project: start from a draft the staff member can edit. Nothing is sent from here.
  let initial: CampaignValues | undefined;
  const project = (projects ?? []).find((p) => p.id === sp.project);
  if (project) {
    const url = `${publicEnv.NEXT_PUBLIC_APP_URL}/projects/${project.slug}`;
    initial = {
      kind: "announcement", project_id: project.id, subject: "New project: {{project_name}}",
      body_html: `<p>Hi {{donor_first_name}},</p>\n<p>${esc(project.summary ?? "We have a new project to share with you.")}</p>\n<p><a href="${url}">Read more about {{project_name}}</a></p>\n<p>Thank you for being part of this work.</p>`,
    };
  }
  return (
    <>
      <p><Link className="underline" href="/admin/campaigns">← All campaigns</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">New campaign</h1>
      <p className="mt-1 text-sm text-ink-soft">You will preview the audience and email, send a test, and confirm before anything is sent.</p>
      <div className="mt-6 max-w-2xl"><CampaignForm campaign={initial} projects={(projects ?? []).map((p) => ({ id: p.id, title: p.title }))} tags={tags ?? []} /></div>
    </>
  );
}
