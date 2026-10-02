import Link from "next/link";
import { getDonorContext } from "@/lib/donor/context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatRichText, sanitizeStory } from "@/lib/admin/project-schema";
import { Empty, ProgressBar } from "@/components/donor/ui";
import { donorSponsorships } from "@/lib/sponsor/holds";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sponsored worker" };

export default async function SponsoredWorkerPage() {
  const { supabase, donor } = await getDonorContext();
  const admin = createSupabaseAdminClient();

  // Every sponsorship (small list). The donor's own gifts, read under row-level security, decide which ones are theirs.
  const { data: all } = await admin.from("sponsorships").select("id, project_id, name, country, description, photo_url, monthly_amount_cents");
  const byProject = new Map((all ?? []).map((s) => [s.project_id as string, s]));
  const ids = [...byProject.keys()];

  let mine: { s: NonNullable<ReturnType<typeof byProject.get>>; monthly: number | null }[] = [];
  if (donor && ids.length) {
    const [{ data: gifts }, { data: recurring }] = await Promise.all([
      supabase.from("donations").select("project_id, status").eq("donor_id", donor.id).in("project_id", ids),
      supabase.from("recurring_donations").select("project_id, status, amount_cents, created_at").eq("donor_id", donor.id).in("project_id", ids),
    ]);
    // A canceled monthly sponsorship ends it here too; past payments alone don't keep her listed (see donorSponsorships).
    const current = donorSponsorships(gifts ?? [], recurring ?? [], new Set(ids));
    mine = [...current].map(([pid, monthly]) => ({ s: byProject.get(pid)!, monthly })).filter((m) => m.s)
      .sort((a, b) => Number(b.monthly != null) - Number(a.monthly != null) || a.s.name.localeCompare(b.s.name));
  }

  // Updates are private to the woman's sponsors: read only for the sponsorships this donor has been verified to support above.
  const { data: updates } = mine.length
    ? await admin.from("project_updates").select("id, project_id, title, body_html, published_at").in("project_id", mine.map((m) => m.s.project_id)).not("published_at", "is", null).order("published_at", { ascending: false })
    : { data: [] };

  return (
    <>
      <h1 className="text-3xl font-semibold">{mine.length > 1 ? "Your sponsored workers" : "Your sponsored worker"}</h1>

      {mine.length === 0 ? (
        <div className="mt-6">
          <Empty title="You are not sponsoring a worker yet">
            <p>When you sponsor a woman, she appears here along with updates and stories about her work.</p>
            <Link href="/sponsor" className="mt-4 inline-block min-h-12 rounded-md bg-brand-700 px-7 py-3 font-semibold text-white hover:bg-brand-800">Sponsor a woman</Link>
          </Empty>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {mine.map(({ s, monthly }) => {
            const stories = (updates ?? []).filter((u) => u.project_id === s.project_id);
            return (
              <section key={s.id} aria-labelledby={`w-${s.id}`} className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center gap-6">
                  {s.photo_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={s.photo_url} alt={`Photo of ${s.name}`} className="size-32 rounded-full object-cover" />
                    : <div aria-hidden="true" className="flex size-32 items-center justify-center rounded-full bg-paper-2 text-ink-soft">No photo</div>}
                  <div className="min-w-0 flex-1">
                    <h2 id={`w-${s.id}`} className="text-2xl font-semibold">{s.name}</h2>
                    {s.country && <p className="text-ink-soft">{s.country}</p>}
                    <p className="mt-1 font-semibold text-brand-800">{monthly != null ? (monthly < s.monthly_amount_cents ? `You sponsor part of her support, ${formatMoney(monthly)} of ${formatMoney(s.monthly_amount_cents)} per month` : `You sponsor her monthly (${formatMoney(monthly)} per month)`) : "Thank you for your gift"}</p>
                    {monthly != null && monthly < s.monthly_amount_cents && (
                      <div className="mt-2 max-w-xs"><ProgressBar fundedCents={monthly} totalCents={s.monthly_amount_cents} hint="of her full sponsorship" /></div>
                    )}
                  </div>
                </div>
                {s.description && <p className="mt-4 max-w-prose whitespace-pre-line">{s.description}</p>}

                <h3 className="mt-6 border-t border-line pt-5 text-lg font-bold">Updates and stories</h3>
                {stories.length === 0 ? <p className="mt-2 text-ink-soft">No updates yet. Check back soon.</p> : (
                  <ol className="mt-4 space-y-8">
                    {stories.map((u) => (
                      <li key={u.id} className="border-l-4 border-gold pl-4">
                        <h4 className="text-lg font-semibold">{u.title}</h4>
                        <p className="text-sm text-ink-soft">{new Date(u.published_at).toLocaleDateString("en-US")}</p>
                        <div className="mt-2 max-w-prose space-y-3" dangerouslySetInnerHTML={{ __html: sanitizeStory(formatRichText(u.body_html)) }} />
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
          <p><Link className="font-semibold text-teal-600 underline" href="/sponsor">Sponsor another woman</Link></p>
        </div>
      )}
    </>
  );
}
