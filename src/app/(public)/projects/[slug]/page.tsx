import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicProject, recentRecognition } from "@/lib/projects/public";
import { formatRichText, sanitizeStory } from "@/lib/admin/project-schema";
import { formatMoney } from "@/lib/money";
import { publicEnv } from "@/lib/env";
import { ProgressBar } from "@/components/site/project-card";
import { ShareButton } from "@/components/site/share-button";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getPublicProject((await params).slug);
  if (!found) return { title: "Project not found", robots: { index: false } };
  const p = found.project as typeof found.project & { seo_title?: string | null; seo_description?: string | null; share_image_url?: string | null };
  const title = p.seo_title || p.title;
  const description = p.seo_description || p.summary || undefined;
  const image = p.share_image_url || p.featured_image_url || undefined;
  return {
    title, description, alternates: { canonical: `/projects/${p.slug}` },
    openGraph: { title, description, type: "article", url: `/projects/${p.slug}`, images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}

export default async function ProjectPage({ params }: Props) {
  const found = await getPublicProject((await params).slug);
  if (!found) notFound();
  const { updates } = found;
  const p = found.project as typeof found.project & { story_html: string | null; gallery: string[] | null };
  const recognition = await recentRecognition(p.id);
  const url = `${publicEnv.NEXT_PUBLIC_APP_URL}/projects/${p.slug}`;
  const open = p.status === "active" || p.status === "goal_reached";

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-semibold">{p.title}</h1>
      {p.location && <p className="mt-1 text-ink-soft">{p.location}</p>}
      {p.featured_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.featured_image_url} alt="" className="mt-6 aspect-[16/9] w-full object-cover" />
      )}

      <section aria-labelledby="progress" className="mt-8">
        <h2 id="progress" className="sr-only">Fundraising progress</h2>
        {p.pct !== null && <ProgressBar pct={p.pct} label={`${p.title} progress`} />}
        <p className="mt-2 text-lg"><strong>{formatMoney(p.raised)}</strong> raised{p.goal_cents ? ` of ${formatMoney(p.goal_cents)} goal (${p.pct}%)` : ""} · {p.donors} donor{p.donors === 1 ? "" : "s"}</p>
        {p.status === "goal_reached" && <p className="mt-1 font-semibold text-success">Goal reached. Thank you! Gifts still help.</p>}
        {p.status === "completed" && <p className="mt-1 font-semibold">This project is complete. Thank you to everyone who gave.</p>}
        {(p.start_date || p.end_date) && <p className="text-sm text-ink-soft">{p.start_date ?? "…"} to {p.end_date ?? "ongoing"}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {open && <Link href={`/donate?project=${p.id}`} className="min-h-12 rounded-md bg-brand-700 px-7 py-3 font-semibold text-white hover:bg-brand-800">Donate to this project</Link>}
          <ShareButton title={p.title} url={url} />
        </div>
      </section>

      {/* Sanitized again at render time as defense in depth; content was also sanitized when saved. */}
      {p.story_html && <div className="prose-story mt-10 space-y-4 text-lg [&_a]:underline [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6" dangerouslySetInnerHTML={{ __html: sanitizeStory(formatRichText(p.story_html)) }} />}

      {(p.gallery ?? []).length > 0 && (
        <section aria-labelledby="gallery" className="mt-10"><h2 id="gallery" className="text-2xl font-semibold">Gallery</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{(p.gallery ?? []).map((src: string) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
          ))}</div></section>
      )}

      <section aria-labelledby="updates" className="mt-12">
        <h2 id="updates" className="text-2xl font-semibold">Project updates</h2>
        {updates.length === 0 ? <p className="mt-3 text-ink-soft">No updates yet.</p> : (
          <ol className="mt-4 space-y-8">{updates.map((u) => (
            <li key={u.id}><h3 className="text-xl font-semibold">{u.title}</h3><p className="text-sm text-ink-soft">{new Date(u.published_at!).toLocaleDateString("en-US")}</p>
              <div className="mt-2 space-y-3" dangerouslySetInnerHTML={{ __html: sanitizeStory(formatRichText(u.body_html)) }} /></li>
          ))}</ol>
        )}
      </section>

      {recognition.length > 0 && (
        <section aria-labelledby="donors" className="mt-12"><h2 id="donors" className="text-2xl font-semibold">Recent supporters</h2>
          <p className="mt-2">{recognition.join(", ")}</p><p className="text-sm text-ink-soft">Shown only for donors who chose public recognition.</p></section>
      )}
    </article>
  );
}
