import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { heldCentsByProject } from "@/lib/sponsor/sponsored";
import { remainingCents } from "@/lib/sponsor/holds";
import { ProgressBar } from "@/components/donor/ui";

export const metadata: Metadata = {
  title: "Sponsor a Woman",
  description: "Sponsor a woman serving as a community health worker with a monthly or one-time gift.",
  alternates: { canonical: "/sponsor" },
};
export const dynamic = "force-dynamic";

interface Woman { remaining: number; id: string; project_id: string; name: string; country: string | null; description: string | null; photo_url: string | null; monthly_amount_cents: number }

export default async function SponsorPage() {
  let women: Woman[] = [];
  if (isSupabaseConfigured) {
    try {
      const supabase = await createSupabaseServerClient(); // row-level security shows only active sponsorships
      const { data } = await supabase.from("sponsorships").select("id, project_id, name, country, description, photo_url, monthly_amount_cents").eq("status", "active").order("display_order").order("name");
      const held = await heldCentsByProject(); // fully sponsored women are not shown; partly sponsored ones stay until the full amount is covered
      women = (data ?? []).map((w) => ({ ...w, remaining: remainingCents(w.monthly_amount_cents, held.get(w.project_id) ?? 0) })).filter((w) => w.remaining > 0);
    } catch { women = []; }
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-semibold">Sponsor a Woman</h1>
      <p className="mt-3 max-w-prose text-lg text-ink-soft">Choose a woman to support. Give the monthly amount shown, or choose a smaller monthly amount to share her sponsorship. A single gift is also welcome.</p>
      {women.length === 0 ? (
        <p className="mt-10 border-y border-line py-10 text-center text-ink-soft">Every woman listed here is already sponsored, or none are open right now. Thank you! You can still <Link className="underline" href="/donate">give to the General Fund</Link>.</p>
      ) : (
        <ul className="mt-10 grid gap-12 sm:grid-cols-2 lg:grid-cols-3">
          {women.map((w) => (
            <li key={w.id} className="flex flex-col items-center text-center">
              {w.photo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={w.photo_url} alt={`Photo of ${w.name}`} className="size-44 rounded-full object-cover" loading="lazy" />
                : <div aria-hidden="true" className="flex size-44 items-center justify-center rounded-full bg-paper-2 text-ink-soft">No photo</div>}
              <h2 className="mt-4 text-2xl font-semibold">{w.name}</h2>
              {w.country && <p className="text-ink-soft">{w.country}</p>}
              {w.description && <p className="mt-3 whitespace-pre-line text-left">{w.description}</p>}
              <p className="mt-4 text-xl font-semibold text-brand-800">{formatMoney(w.monthly_amount_cents)} <span className="text-base font-normal text-ink-soft">per month</span></p>
              {w.remaining < w.monthly_amount_cents && (
                <div className="mt-2 w-full max-w-56">
                  <ProgressBar fundedCents={w.monthly_amount_cents - w.remaining} totalCents={w.monthly_amount_cents}
                    hint={`${formatMoney(w.remaining)} per month still needed`} />
                </div>
              )}
              <Link href={`/donate?sponsor=${w.id}&frequency=monthly`} className="mt-3 min-h-12 rounded-md bg-brand-700 px-8 py-3 font-semibold text-white hover:bg-brand-800">
                Sponsor<span className="sr-only"> {w.name}</span>
              </Link>
            </li>))}
        </ul>
      )}
    </div>
  );
}
