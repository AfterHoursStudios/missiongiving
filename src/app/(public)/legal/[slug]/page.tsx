import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_PAGES } from "@/lib/legal";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() { return Object.keys(LEGAL_PAGES).map((slug) => ({ slug })); }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = LEGAL_PAGES[(await params).slug];
  return page ? { title: page.title, description: page.summary, alternates: { canonical: `/legal/${(await params).slug}` } } : {};
}

export default async function LegalPage({ params }: Props) {
  const page = LEGAL_PAGES[(await params).slug];
  if (!page) notFound();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {!page.final && <p role="note" className="mb-6 rounded-md bg-warning-bg p-3 text-warning"><strong>Draft placeholder: pending legal review.</strong> This text has not been approved by Ultimate Mission or legal counsel.</p>}
      <h1 className="text-4xl font-semibold">{page.title}</h1>
      {page.intro && <p className="mt-6 text-lg">{page.intro}</p>}
      {page.points.length > 0 && <div className="mt-6 space-y-4 text-lg">{page.points.map((p) => <p key={p}>{p}</p>)}</div>}
      {page.sections?.map((sec) => (
        <section key={sec.heading} className="mt-10">
          <h2 className="text-2xl font-semibold">{sec.heading}</h2>
          <div className="mt-3 space-y-3 text-lg">
            {sec.body.map((b, i) => typeof b === "string"
              ? <p key={i}>{b}</p>
              : <ul key={i} className="list-disc space-y-2 pl-6">{b.bullets.map((x) => <li key={x}>{x}</li>)}</ul>)}
          </div>
        </section>
      ))}
    </div>
  );
}
