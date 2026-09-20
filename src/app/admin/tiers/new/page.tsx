import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { TierForm } from "@/components/admin/tier-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New tier" };

export default async function NewTierPage() {
  await requirePermission("tiers.manage");
  const { data: projects } = await createSupabaseAdminClient().from("projects").select("id, title").neq("status", "archived").order("title");
  return (
    <>
      <p><Link className="underline" href="/admin/tiers">← All tiers</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">New tier</h1>
      <div className="mt-6 max-w-2xl"><TierForm projects={projects ?? []} /></div>
    </>
  );
}
