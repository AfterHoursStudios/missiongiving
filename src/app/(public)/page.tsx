import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { getSetting } from "@/lib/settings";
import { HOME_ALT_KEY, HOME_IMAGE_KEY } from "@/lib/admin/home-image-keys";
import { listPublicProjects, type PublicProject } from "@/lib/projects/public";
import { ProjectCard } from "@/components/site/project-card";
import { ScrollReveal } from "@/components/site/scroll-reveal";
import { DonateModalButton } from "@/components/donate/donate-modal";
import { hasDonorAccount, loadDonateSetup } from "@/lib/donations/donate-config";

export const dynamic = "force-dynamic";

async function featuredProjects(): Promise<PublicProject[]> {
  if (!isSupabaseConfigured) return [];
  try { return (await listPublicProjects()).filter((p) => p.featured && p.status !== "completed").slice(0, 3); } catch { return []; }
}

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
  // "Donate now" opens the default donation form in a pop-up. If guest checkout is off and the visitor isn't signed in,
  // it falls back to the /donate page, which asks them to sign in.
  // Signed-in donors skip the pop-up and give from their account with a saved card (see /dashboard/give).
  const donate = await hasDonorAccount().catch(() => false)
    ? { state: "account" as const }
    : await loadDonateSetup().catch(() => ({ state: "unconfigured" as const }));
  const donateCls = "inline-flex min-h-12 items-center rounded-full bg-ink px-8 font-semibold text-white hover:bg-ink/85";
  const pillOutline = "inline-flex min-h-12 items-center rounded-full border border-ink/30 bg-white px-8 font-semibold text-ink hover:border-ink";
  return (
    <>
      <ScrollReveal />
      {/* Hero, Nike-style: a full-width photo (shown whole, at its own proportions, never cropped), then a big bold headline and pill buttons centred below. */}
      <section aria-labelledby="hero-title" className="bg-white">
        <div className="mx-auto max-w-[90rem] px-0 sm:px-8">
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.url} alt={hero.alt} className="mg-enter h-auto w-full" fetchPriority="high" />
          ) : (
            // Placeholder until a photo is uploaded in Admin > Settings > Home page photo.
            <div role="img" aria-label="Photo placeholder: community health worker with a mother and infant"
              className="mg-enter flex h-[52vh] min-h-72 w-full items-center justify-center bg-paper-2 text-center text-ink-soft sm:h-[70vh]">
              Approved photo goes here
            </div>
          )}
        </div>
        <div className="mx-auto max-w-4xl px-4 pb-16 pt-10 text-center sm:pt-14">
          <h1 id="hero-title" className="mg-enter font-sans text-5xl font-black uppercase leading-[0.9] tracking-tight sm:text-7xl lg:text-8xl [--mg-delay:200ms]">
            Your generosity.<br />Their opportunity.
          </h1>
          <div className="mg-enter mt-8 flex flex-wrap justify-center gap-3 [--mg-delay:440ms]">
            {donate.state === "ready"
              ? <DonateModalButton config={donate.config} template={donate.template} className={donateCls}>Donate now</DonateModalButton>
              : <Link href={donate.state === "account" ? "/dashboard/give" : "/donate"} className={donateCls}>Donate now</Link>}
            <Link href="/sponsor" className={pillOutline}>Sponsor a woman</Link>
            <Link href="/projects" className={pillOutline}>See projects</Link>
          </div>
        </div>
      </section>


      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-[var(--space-section)]" aria-labelledby="featured">
          <h2 id="featured" className="text-3xl font-semibold">Featured projects</h2>
          <div className="mt-6 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">{featured.map((p, i) => (
            <div key={p.id} data-reveal className="mg-lift rounded-lg" style={{ "--mg-delay": `${i * 120}ms` } as React.CSSProperties}><ProjectCard p={p} fullSummary /></div>
          ))}</div>
        </section>
      )}



      <section className="bg-paper-2" aria-labelledby="trust">
        <div data-reveal className="mx-auto max-w-6xl px-4 py-[var(--space-section)]">
          <h2 id="trust" className="text-3xl font-semibold">Trust and transparency</h2>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2">
            <li><strong>Secure payments.</strong> Cards and bank accounts are handled by Stripe. Mission Giving never stores card or bank numbers.</li>
            <li><strong>Clear receipts.</strong> Every confirmed gift gets a numbered receipt, and you can download an annual giving statement.</li>
            <li><strong>Your choices.</strong> Receipts are always sent, but news and project emails only if you opt in. Unsubscribe in one click.</li>
            <li><strong>Your control.</strong> Change or cancel a recurring gift any time, download your data, or ask us to delete your account.</li>
          </ul>
        </div>
      </section>

      <section className="mg-gradient bg-[linear-gradient(120deg,var(--teal-800),var(--teal-600),var(--brand-800),var(--teal-800))] text-white">
        <div data-reveal className="mx-auto max-w-6xl px-4 py-[var(--space-section)]">
          <h2 className="text-3xl font-semibold">Give monthly</h2>
          <p className="mt-3 max-w-prose text-white/90">Steady gifts let health workers plan ahead. Cancel or change your gift any time from your account.</p>
          <Link href="/donate?frequency=monthly" className="mg-lift mt-6 inline-block min-h-12 rounded-md bg-white px-7 py-3 font-semibold text-teal-800">Become a monthly donor</Link>
        </div>
      </section>


      <section data-reveal className="mx-auto max-w-3xl px-4 py-[var(--space-section)]" aria-labelledby="faq">
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
