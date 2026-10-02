import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { moveTier, setAllTierFrequencies, setTierStatus } from "@/lib/admin/tier-actions";
import { CheckInput, SimpleForm } from "@/components/donor/forms";
import { formatMoney } from "@/lib/money";
import { StatusDot } from "@/components/donor/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Donation tiers" };

const btn = "min-h-11 px-2 underline disabled:opacity-40";

export default async function TiersPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  await requirePermission("tiers.manage");
  const showArchived = (await searchParams).archived === "1";
  let q = createSupabaseAdminClient().from("donation_tiers")
    .select("id, internal_name, public_title, amount_cents, status, featured, allow_one_time, allow_monthly, allow_yearly, general_fund, projects(title)")
    .order("display_order").order("amount_cents");
  if (!showArchived) q = q.neq("status", "archived");
  const { data: tiers } = await q;
  const rows = tiers ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Donation tiers</h1>
        <Link href="/admin/tiers/new" className="min-h-11 rounded-md bg-brand-700 px-5 py-2.5 font-semibold text-white">New tier</Link>
      </div>
      <p className="mt-2 max-w-prose text-ink-soft">Tiers appear on the donate page in this order. Tiers are archived, never deleted, because past gifts refer to them.</p>
      <p className="mt-2"><Link className="underline" href={showArchived ? "/admin/tiers" : "/admin/tiers?archived=1"}>{showArchived ? "Hide archived" : "Show archived"}</Link></p>

      <section aria-labelledby="freq" className="mt-8 max-w-xl border-l-4 border-teal-600 pl-4">
        <h2 id="freq" className="text-xl font-semibold">Offer tiers for these frequencies (all tiers)</h2>
        <p className="text-sm text-ink-soft">For example, tick only <strong>Monthly</strong> to show the preset amounts to monthly donors only. One-time and yearly donors then use the custom amount box.</p>
        <div className="mt-3"><SimpleForm action={setAllTierFrequencies} submit="Apply to all tiers">
          <CheckInput label="One-time gifts" name="allow_one_time" defaultChecked={rows.some((t) => t.allow_one_time)} />
          <CheckInput label="Monthly gifts" name="allow_monthly" defaultChecked={rows.some((t) => t.allow_monthly)} />
          <CheckInput label="Yearly gifts" name="allow_yearly" defaultChecked={rows.some((t) => t.allow_yearly)} />
        </SimpleForm></div>
      </section>

      {rows.length === 0 ? <p className="mt-8 border-y border-line py-10 text-center text-ink-soft">No tiers.</p> : (
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[44rem] text-left">
          <caption className="sr-only">Donation tiers</caption>
          <thead><tr className="border-b-2 border-ink">{["Tier", "Amount", "Frequencies", "Where", "Status", "Actions"].map((h) => <th key={h} scope="col" className="py-2 pr-4">{h}</th>)}</tr></thead>
          <tbody>{rows.map((t, i) => {
            const project = Array.isArray(t.projects) ? t.projects[0] : t.projects;
            return (
              <tr key={t.id} className="border-b border-line align-top">
                <td className="py-3 pr-4"><Link className="font-semibold underline" href={`/admin/tiers/${t.id}`}>{t.public_title}</Link>{t.featured && <span className="ml-2 rounded bg-teal-800 px-1.5 text-xs font-semibold text-white">Recommended</span>}<br /><span className="text-sm text-ink-soft">{t.internal_name}</span></td>
                <td className="py-3 pr-4 font-semibold">{formatMoney(t.amount_cents)}</td>
                <td className="py-3 pr-4">{[t.allow_one_time && "One time", t.allow_monthly && "Monthly", t.allow_yearly && "Yearly"].filter(Boolean).join(", ")}</td>
                <td className="py-3 pr-4">{[t.general_fund && "General Fund", project && (project as { title: string }).title].filter(Boolean).join(", ")}</td>
                <td className="py-3 pr-4"><StatusDot status={t.status} /></td>
                <td className="py-3">
                  <div className="flex flex-wrap">
                    <form action={moveTier}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="dir" value="up" /><button className={btn} disabled={i === 0}>Move up<span className="sr-only"> {t.public_title}</span></button></form>
                    <form action={moveTier}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="dir" value="down" /><button className={btn} disabled={i === rows.length - 1}>Move down<span className="sr-only"> {t.public_title}</span></button></form>
                    {t.status !== "active" && <StatusBtn id={t.id} status="active" label="Activate" name={t.public_title} />}
                    {t.status === "active" && <StatusBtn id={t.id} status="inactive" label="Deactivate" name={t.public_title} />}
                    {t.status !== "archived" && <StatusBtn id={t.id} status="archived" label="Archive" name={t.public_title} />}
                  </div>
                </td>
              </tr>);
          })}</tbody></table></div>
      )}
    </>
  );
}

function StatusBtn({ id, status, label, name }: { id: string; status: string; label: string; name: string }) {
  return <form action={setTierStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} /><button className={btn}>{label}<span className="sr-only"> {name}</span></button></form>;
}
