import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { findDuplicateGroups } from "@/lib/admin/duplicates";
import { mergeDonors } from "@/lib/admin/donor-actions";
import { MergePair } from "@/components/admin/merge-pair";

export const dynamic = "force-dynamic";
export const metadata = { title: "Possible duplicates" };

const REASON = { email: "Same email address", phone: "Same phone number", name_postal: "Same name and postal code" } as const;

export default async function DuplicatesPage() {
  await requirePermission("donors.edit");
  const { data } = await createSupabaseAdminClient().from("donor_summary").select("id, first_name, last_name, email, phone, created_at, lifetime_cents, gift_count").limit(20000);
  const { data: addr } = await createSupabaseAdminClient().from("donor_profiles").select("id, postal_code").is("deleted_at", null).not("postal_code", "is", null);
  const postal = new Map((addr ?? []).map((a) => [a.id, a.postal_code as string]));
  const groups = findDuplicateGroups((data ?? []).map((d) => ({ ...d, postal_code: postal.get(d.id) ?? null })));

  return (
    <>
      <p><Link className="underline" href="/admin/donors">← All donors</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">Possible duplicates</h1>
      <p className="mt-2 max-w-prose text-ink-soft">Matches are suggestions. Review each pair. Merging moves all gifts, recurring gifts, notes and tags into the record you keep. The other record is retained and marked merged, and an audit entry is written. Opt-outs are never overridden.</p>
      {groups.length === 0 ? <p className="mt-8 border-y border-line py-10 text-center text-ink-soft">No likely duplicates found.</p> : (
        <ul className="mt-6 space-y-8">
          {groups.map((g) => (
            <li key={g.reason + g.key} className="border-l-4 border-warning pl-4">
              <h2 className="text-lg font-semibold">{REASON[g.reason]}</h2>
              <ul className="mt-2">{g.donors.map((d) => <li key={d.id}><Link className="underline" href={`/admin/donors/${d.id}`}>{d.first_name} {d.last_name}</Link> · {d.email} · {(d as unknown as { gift_count: number }).gift_count} gifts</li>)}</ul>
              {g.donors.length === 2 && (
                <details className="mt-3">
                  <summary className="min-h-11 cursor-pointer py-2 font-semibold underline">Merge these two</summary>
                  <div className="mt-2 max-w-md"><MergePair groupId={g.key} action={mergeDonors} donors={[g.donors[0], g.donors[1]]} /></div>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

