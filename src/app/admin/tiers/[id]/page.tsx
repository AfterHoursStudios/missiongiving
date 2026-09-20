import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { TierForm } from "@/components/admin/tier-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit tier" };

export default async function EditTierPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("tiers.manage");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const db = createSupabaseAdminClient();
  const [{ data: tier }, { data: projects }] = await Promise.all([
    db.from("donation_tiers").select("*").eq("id", id).maybeSingle(),
    db.from("projects").select("id, title").neq("status", "archived").order("title"),
  ]);
  if (!tier) notFound();
  return (
    <>
      <p><Link className="underline" href="/admin/tiers">← All tiers</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">Edit tier: {tier.public_title}</h1>
      <div className="mt-6 max-w-2xl"><TierForm tier={tier} projects={projects ?? []} /></div>
    </>
  );
}
