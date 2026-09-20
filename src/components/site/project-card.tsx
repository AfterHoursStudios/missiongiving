import Link from "next/link";
import type { PublicProject } from "@/lib/projects/public";
import { formatMoney } from "@/lib/money";

export function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-3 w-full bg-paper-2">
      <div className="h-3 bg-brand-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ProjectCard({ p }: { p: PublicProject }) {
  const done = p.status === "completed";
  return (
    <article className="flex flex-col">
      {p.featured_image_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={p.featured_image_url} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
        : <div className="flex aspect-[4/3] items-center justify-center border-2 border-dashed border-ink-soft text-ink-soft">Project photo placeholder</div>}
      <h3 className="mt-4 text-2xl font-semibold"><Link href={`/projects/${p.slug}`} className="hover:underline">{p.title}</Link></h3>
      {p.location && <p className="text-sm text-ink-soft">{p.location}</p>}
      {p.summary && <p className="mt-2">{p.summary}</p>}
      <div className="mt-4">
        {p.pct !== null && <ProgressBar pct={p.pct} label={`${p.title} progress`} />}
        <p className="mt-2 text-sm"><strong>{formatMoney(p.raised)}</strong> raised{p.goal_cents ? ` of ${formatMoney(p.goal_cents)} (${p.pct}%)` : ""}{p.donors > 0 ? ` · ${p.donors} donor${p.donors === 1 ? "" : "s"}` : ""}</p>
        {(p.start_date || p.end_date) && <p className="text-sm text-ink-soft">{p.start_date ?? "…"} to {p.end_date ?? "ongoing"}</p>}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {!done && <Link href={`/donate?project=${p.id}`} className="min-h-11 rounded-md bg-brand-700 px-5 py-2.5 font-semibold text-white hover:bg-brand-800">Donate<span className="sr-only"> to {p.title}</span></Link>}
        <Link href={`/projects/${p.slug}`} className="min-h-11 rounded-md border-2 border-teal-800 px-5 py-2 font-semibold text-teal-800">Read more<span className="sr-only"> about {p.title}</span></Link>
      </div>
    </article>
  );
}
