import type { Metadata } from "next";
import { listPublicProjects } from "@/lib/projects/public";
import { ProjectCard } from "@/components/site/project-card";

export const metadata: Metadata = {
  title: "Projects",
  description: "Fundraising projects supporting Ultimate Mission's community health workers.",
  alternates: { canonical: "/projects" },
};
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const all = await listPublicProjects();
  const active = all.filter((p) => p.status === "active" || p.status === "goal_reached");
  const completed = all.filter((p) => p.status === "completed");
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-semibold">Projects</h1>
      <section aria-labelledby="active" className="mt-10">
        <h2 id="active" className="text-2xl font-semibold">Active projects</h2>
        {active.length === 0 ? <p className="mt-4 border-y border-line py-10 text-center text-ink-soft">No active projects right now. You can still give to the General Fund.</p> : (
          <div className="mt-6 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">{active.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
        )}
      </section>
      {completed.length > 0 && (
        <section aria-labelledby="done" className="mt-16">
          <h2 id="done" className="text-2xl font-semibold">Completed projects</h2>
          <div className="mt-6 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">{completed.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
        </section>
      )}
    </div>
  );
}
