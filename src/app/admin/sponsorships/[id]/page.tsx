import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { SponsorshipForm } from "@/components/admin/sponsorship-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit sponsorship" };

export default async function EditSponsorshipPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("projects.manage");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { data: s } = await createSupabaseAdminClient().from("sponsorships").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();
  return (
    <>
      <p><Link className="underline" href="/admin/sponsorships">← All sponsorships</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">{s.name}</h1>
      <p className="text-sm text-ink-soft">Changing the amount affects new gifts only. Existing monthly sponsors keep the amount they signed up with.</p>
      <div className="mt-6 max-w-2xl"><SponsorshipForm s={s} /></div>
    </>
  );
}
