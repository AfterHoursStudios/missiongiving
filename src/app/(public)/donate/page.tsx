import Link from "next/link";
import { DonateFlow, type FlowConfig } from "@/components/donate/donate-flow";
import { getUser } from "@/lib/auth/session";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgSettings } from "@/lib/settings";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

export const metadata = { title: "Donate", alternates: { canonical: "/donate" } };
export const dynamic = "force-dynamic";

export default async function DonatePage({ searchParams }: { searchParams: Promise<{ frequency?: string; project?: string; sponsor?: string }> }) {
  const sp = await searchParams;

  if (!isSupabaseConfigured) {
    return <Shell><p className="rounded-md bg-warning-bg p-4 text-warning">This site is not connected to its database yet. See the README setup steps.</p></Shell>;
  }
  const user = await getUser();
  if (!user) {
    return (
      <Shell>
        <p className="max-w-prose text-lg">Please sign in or create a free account to give. It lets you see your history, download receipts and manage recurring gifts.</p>
        <div className="mt-6 flex gap-4">
          <Link className="min-h-12 rounded-md bg-brand-700 px-7 py-3 font-semibold text-white" href="/sign-in?next=/donate">Sign in</Link>
          <Link className="min-h-12 rounded-md border-2 border-teal-800 px-7 py-3 font-semibold text-teal-800" href="/register">Create account</Link>
        </div>
      </Shell>
    );
  }

  const supabase = await createSupabaseServerClient(); // public catalog readable under RLS
  const settings = await getOrgSettings();
  const [{ data: tiers }, { data: projects }, { data: profile }] = await Promise.all([
    supabase.from("donation_tiers").select("id, public_title, amount_cents, short_description, featured, allow_one_time, allow_monthly, allow_yearly, general_fund, project_id, display_order, active_from, active_until")
      .eq("status", "active").order("display_order"),
    supabase.from("projects").select("id, title, allow_custom_amount").in("status", ["active", "goal_reached"]).eq("is_public", true).order("title"),
    createSupabaseAdminClient().from("donor_profiles").select("first_name, last_name").eq("user_id", user.id).maybeSingle(),
  ]);
  const liveTiers = withinActiveWindow(tiers ?? []);
  const sponsorId = /^[0-9a-f-]{36}$/i.test(sp.sponsor ?? "") ? sp.sponsor : null;
  const { data: sponsor } = sponsorId
    ? await supabase.from("sponsorships").select("id, name, monthly_amount_cents").eq("id", sponsorId).eq("status", "active").maybeSingle()
    : { data: null };
  const freq = sp.frequency === "monthly" || sp.frequency === "yearly" ? sp.frequency : "one_time";

  const config: FlowConfig = {
    tiers: liveTiers, projects: projects ?? [],
    customEnabled: settings.custom_amount_enabled, minCents: settings.min_donation_cents, maxCents: settings.max_donation_cents,
    publishableKey: publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
    defaults: { firstName: profile?.first_name ?? "", lastName: profile?.last_name ?? "" },
    sponsorship: sponsor ? { id: sponsor.id, name: sponsor.name, amountCents: sponsor.monthly_amount_cents } : null,
    initialFrequency: sponsor && freq === "yearly" ? "monthly" : sponsor && !sp.frequency ? "monthly" : freq, initialProjectId: (projects ?? []).some((p) => p.id === sp.project) ? sp.project! : null,
  };
  return <Shell><DonateFlow config={config} /></Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-8 text-4xl font-semibold">Give to Ultimate Mission</h1>
      {children}
    </div>
  );
}

function withinActiveWindow<T extends { active_from: string | null; active_until: string | null }>(rows: T[]) {
  const now = Date.now();
  return rows.filter((t) => (!t.active_from || +new Date(t.active_from) <= now) && (!t.active_until || +new Date(t.active_until) >= now));
}
