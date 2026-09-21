import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { sponsoredProjectIds } from "@/lib/sponsor/sponsored";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sponsorships" };

export default async function SponsorshipsPage() {
  await requirePermission("projects.manage");
  const { data, error } = await createSupabaseAdminClient().from("sponsorships")
    .select("id, project_id, name, country, monthly_amount_cents, status, photo_url, display_order").neq("status", "archived").order("display_order").order("name");
  const taken = error ? new Set<string>() : await sponsoredProjectIds();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Sponsorships</h1>
        <Link href="/admin/sponsorships/new" className="min-h-11 rounded-md bg-brand-700 px-5 py-2.5 font-semibold text-white">Add a woman</Link>
      </div>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">Each entry appears on the public <Link className="underline" href="/sponsor">Sponsor a Woman</Link> page with a Sponsor button. Gifts are recorded under her name in receipts and reports.</p>
      {error && <p role="alert" className="mt-4 rounded-md bg-danger-bg p-3 text-danger">Could not load sponsorships. Has the database migration <code>0010_sponsorships.sql</code> been applied?</p>}
      {!error && (data ?? []).length === 0 ? <p className="mt-8 border-y border-line py-10 text-center text-ink-soft">No sponsorships yet.</p> : (
        <ul className="mt-6 divide-y divide-line border-y border-line">
          {(data ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-4 py-3">
              {s.photo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={s.photo_url} alt="" className="size-14 rounded-full object-cover" />
                : <span aria-hidden="true" className="size-14 rounded-full bg-paper-2" />}
              <span className="flex-1"><Link className="font-semibold underline" href={`/admin/sponsorships/${s.id}`}>{s.name}</Link>{s.country && <span className="text-ink-soft"> · {s.country}</span>}<span className="block text-sm text-ink-soft">{formatMoney(s.monthly_amount_cents)} per month · {s.status}{taken.has(s.project_id) && <strong className="text-brand-800"> · Sponsored (hidden from the public page)</strong>}</span></span>
            </li>))}
        </ul>
      )}
    </>
  );
}
