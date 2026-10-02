import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { SponsorshipForm } from "@/components/admin/sponsorship-form";
import { addProjectUpdate } from "@/lib/admin/project-actions";
import { cancelSponsorship, removeWorker } from "@/lib/admin/sponsorship-actions";
import { sponsorsByProject } from "@/lib/sponsor/sponsored";
import { formatMoney } from "@/lib/money";
import { CheckInput, SimpleForm, TextInput } from "@/components/donor/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit sponsorship" };

export default async function EditSponsorshipPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.manage");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { data: s } = await createSupabaseAdminClient().from("sponsorships").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();
  const { data: updates } = await createSupabaseAdminClient().from("project_updates").select("id, title, published_at").eq("project_id", s.project_id).order("created_at", { ascending: false });
  const sponsors = (await sponsorsByProject()).get(s.project_id) ?? [];
  return (
    <>
      <p><Link className="underline" href="/admin/sponsorships">← All sponsorships</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">{s.name}</h1>
      <p className="text-sm text-ink-soft">Changing the amount affects new gifts only. Existing monthly sponsors keep the amount they signed up with.</p>
      <div className="mt-6 max-w-2xl"><SponsorshipForm s={s} /></div>

      <section className="mt-14 max-w-2xl space-y-8" aria-labelledby="manage">
        <h2 id="manage" className="text-2xl font-semibold">Sponsor and removal</h2>
        <div>
          <p>{sponsors.length ? "Monthly sponsors:" : "She has no monthly sponsor."}</p>
          {sponsors.map((x) => (
            <div key={x.recurringId} className="mt-3 border-t border-line pt-3"><SimpleForm action={cancelSponsorship} submit={`Cancel ${x.name}'s sponsorship`} tone="danger">
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="recurringId" value={x.recurringId} />
              <p><strong>{x.name}</strong> gives {formatMoney(x.amountCents)} per month.</p>
              <CheckInput label="Cancel this monthly gift. What they gave is freed for other sponsors. Past gifts stay." name="confirm" />
            </SimpleForm></div>
          ))}
        </div>
        <div>
          <p className="text-sm text-ink-soft">Removing her takes her off the site and this list. Past gifts, receipts and reports keep her name. Any monthly sponsor is canceled.</p>
          <div className="mt-3"><SimpleForm action={removeWorker} submit="Remove worker" tone="danger">
            <input type="hidden" name="id" value={s.id} />
            <CheckInput label={`Remove ${s.name}`} name="confirm" />
          </SimpleForm></div>
        </div>
      </section>

      <section className="mt-14 max-w-2xl" aria-labelledby="stories">
        <h2 id="stories" className="text-2xl font-semibold">Updates and stories</h2>
        <p className="text-sm text-ink-soft">Shown only to donors who sponsor her, on their Sponsored worker page. Press Enter twice for a new paragraph.</p>
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {(updates ?? []).map((u) => <li key={u.id} className="py-2">{u.title} <span className="text-sm text-ink-soft">{u.published_at ? `published ${new Date(u.published_at).toLocaleDateString("en-US")}` : "draft"}</span></li>)}
          {(updates ?? []).length === 0 && <li className="py-2 text-ink-soft">No updates yet.</li>}
        </ul>
        <div className="mt-4"><SimpleForm action={addProjectUpdate} submit="Save update">
          <input type="hidden" name="projectId" value={s.project_id} />
          <TextInput label="Title" name="title" required />
          <div><label htmlFor="ubody" className="block font-semibold">Update or story</label>
            <textarea id="ubody" name="body" rows={6} required className="mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2" /></div>
          <CheckInput label="Publish now (unchecked saves a draft)" name="publish" />
        </SimpleForm></div>
      </section>
    </>
  );
}
