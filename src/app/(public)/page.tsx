import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { HOME_ALT_KEY, HOME_IMAGE_KEY } from "@/lib/admin/home-image-keys";
import { listPublicProjects, type PublicProject } from "@/lib/projects/public";
import { ProjectCard } from "@/components/site/project-card";

export const dynamic = "force-dynamic";

async function featuredProjects(): Promise<PublicProject[]> {
  if (!isSupabaseConfigured) return [];
  try { return (await listPublicProjects()).filter((p) => p.featured && p.status !== "completed").slice(0, 3); } catch { return []; }
}

// Impact statistics are ADMIN-EDITABLE placeholders until approved values are entered (Phase 4 settings UI).
const impact = [
  { label: "[Statistic label]", value: "—" },
  { label: "[Statistic label]", value: "—" },
  { label: "[Statistic label]", value: "—" },
];

const faqs = [
  ["Is my gift secure?", "Payments are processed by Stripe. Mission Giving never stores card or bank numbers."],
  ["Can I give monthly?", "Yes. Choose monthly or yearly at checkout and manage or cancel any time from your account."],
  ["How long do bank (ACH) payments take?", "ACH payments stay pending until the bank settles them, which can take several business days."],
  ["Will I get a receipt?", "Yes. Receipts appear in your account once a payment is confirmed."],
];

async function heroPhoto(): Promise<{ url: string; alt: string } | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const url = (await getSetting(HOME_IMAGE_KEY)) as string | null;
    return url ? { url, alt: ((await getSetting(HOME_ALT_KEY)) as string | null) || "" } : null;
  } catch { return null; }
}

export default async function HomePage() {
  const featured = await featuredProjects();
  const hero = await heroPhoto();
  return (
    <>
      <section className="bg-paper-2">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-[var(--space-section)] md:grid-cols-2">
          <div>
            <p className="font-semibold uppercase tracking-wide text-teal-600">Ultimate Mission</p>
            <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">Give hope. Empower women. Save lives.</h1>
            <span aria-hidden="true" className="mt-4 block h-1.5 w-20 rounded bg-gold" />
            <p className="mt-5 max-w-prose text-lg text-ink-soft">
              Ultimate Mission equips local women as community health workers, caring for infants in rural villages
              in India, Ethiopia, the Philippines and South Sudan.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/donate" className="min-h-12 rounded-md bg-brand-700 px-7 py-3 font-semibold text-white hover:bg-brand-800">Donate now</Link>
              <Link href="/projects" className="min-h-12 rounded-md border-2 border-teal-800 px-7 py-3 font-semibold text-teal-800 hover:bg-white">See projects</Link>
            </div>
          </div>
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.url} alt={hero.alt} className="aspect-[4/3] w-full object-cover" fetchPriority="high" />
          ) : (
            // Placeholder until a photo is uploaded in Admin > Settings > Home page photo.
            <div role="img" aria-label="Photo placeholder: community health worker with a mother and infant"
              className="flex aspect-[4/3] items-center justify-center border-2 border-dashed border-ink-soft text-center text-ink-soft">
              Approved photo goes here
            </div>
          )}
        </div>
      </section>

      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-[var(--space-section)]" aria-labelledby="featured">
          <h2 id="featured" className="text-3xl font-semibold">Featured projects</h2>
          <div className="mt-6 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">{featured.map((p) => <ProjectCard key={p.id} p={p} fullSummary />)}</div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 py-[var(--space-section)]" aria-labelledby="impact">
        <h2 id="impact" className="text-3xl font-semibold">Our impact</h2>
        <p className="mt-2 text-ink-soft">Figures below are placeholders until Ultimate Mission enters approved values.</p>
        <dl className="mt-8 grid gap-8 sm:grid-cols-3">
          {impact.map((s, i) => (
            <div key={i} className="flex flex-col-reverse"><dt className="mt-1 text-ink-soft">{s.label}</dt><dd className="font-display text-5xl text-brand-700">{s.value}</dd></div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-[var(--space-section)]" aria-labelledby="use">
        <h2 id="use" className="text-3xl font-semibold">How your gift is used</h2>
        <p role="note" className="mt-2 max-w-prose rounded-md bg-paper-2 p-3 text-sm text-ink-soft">Placeholder: Ultimate Mission will add approved wording and figures here. Nothing on this page states how any amount is spent until they do.</p>
        <p className="mt-4 max-w-prose text-lg">Gifts to the <strong>General Fund</strong> support Ultimate Mission where it is needed most. Gifts to a <strong>project</strong> are tracked as restricted to that project, and each project page shows the amount raised toward its goal.</p>
      </section>

      <section className="bg-paper-2" aria-labelledby="trust">
        <div className="mx-auto max-w-6xl px-4 py-[var(--space-section)]">
          <h2 id="trust" className="text-3xl font-semibold">Trust and transparency</h2>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2">
            <li><strong>Secure payments.</strong> Cards and bank accounts are handled by Stripe. Mission Giving never stores card or bank numbers.</li>
            <li><strong>Clear receipts.</strong> Every confirmed gift gets a numbered receipt, and you can download an annual giving statement.</li>
            <li><strong>Your choices.</strong> Receipts are always sent, but news and project emails only if you opt in. Unsubscribe in one click.</li>
            <li><strong>Your control.</strong> Change or cancel a recurring gift any time, download your data, or ask us to delete your account.</li>
          </ul>
        </div>
      </section>

      <section className="bg-teal-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-[var(--space-section)]">
          <h2 className="text-3xl font-semibold">Give monthly</h2>
          <p className="mt-3 max-w-prose text-white/90">Steady gifts let health workers plan ahead. Cancel or change your gift any time from your account.</p>
          <Link href="/donate?frequency=monthly" className="mt-6 inline-block min-h-12 rounded-md bg-white px-7 py-3 font-semibold text-teal-800">Become a monthly donor</Link>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pt-[var(--space-section)]" aria-labelledby="stories">
        <h2 id="stories" className="text-3xl font-semibold">Stories</h2>
        <p role="note" className="mt-3 rounded-md bg-paper-2 p-3 text-sm text-ink-soft">Placeholder: stories from the field will appear here once Ultimate Mission provides approved, consented text and photos. None are invented.</p>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-[var(--space-section)]" aria-labelledby="faq">
        <h2 id="faq" className="text-3xl font-semibold">Questions</h2>
        <div className="mt-6 divide-y divide-line border-y border-line">
          {faqs.map(([q, a]) => (
            <details key={q} className="py-4"><summary className="cursor-pointer font-semibold">{q}</summary><p className="mt-2 text-ink-soft">{a}</p></details>
          ))}
        </div>
      </section>
    </>
  );
}
