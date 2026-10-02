import "server-only";
import { heldCentsByProject } from "@/lib/sponsor/sponsored";
import { remainingCents } from "@/lib/sponsor/holds";
import type { FlowConfig } from "@/components/donate/donate-flow";
import type { FormTemplateInput } from "@/lib/admin/form-template-schema";
import { getUser } from "@/lib/auth/session";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrgSettings } from "@/lib/settings";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { formTemplateById, resolveFormTemplate } from "@/lib/donations/form-templates";

export type DonateSetup =
  | { state: "ready"; config: FlowConfig; template: FormTemplateInput | null }
  | { state: "unconfigured" }
  | { state: "sign-in" };

/**
 * Everything the donation form needs, shared by the /donate page and the home page's "Donate now" pop-up so both show
 * the same default form. "sign-in" means the visitor isn't signed in and guest checkout is off (Admin → Settings).
 */
export async function loadDonateSetup(opts: { project?: string; sponsor?: string; frequency?: string; campaign?: string; form?: string } = {}): Promise<DonateSetup> {
  if (!isSupabaseConfigured) return { state: "unconfigured" };
  const user = await getUser(); // signed in, or (if enabled) a guest giving with no account
  const settings = await getOrgSettings();
  if (!user && !settings.guest_donations_enabled) return { state: "sign-in" };

  const supabase = await createSupabaseServerClient(); // public catalog readable under RLS, signed in or not
  const [{ data: tiers }, { data: projects }, { data: profile }] = await Promise.all([
    supabase.from("donation_tiers").select("id, public_title, amount_cents, short_description, featured, allow_one_time, allow_monthly, allow_yearly, general_fund, project_id, display_order, active_from, active_until")
      .eq("status", "active").order("display_order"),
    supabase.from("projects").select("id, title, allow_custom_amount").in("status", ["active", "goal_reached"]).eq("is_public", true).order("title"),
    user ? createSupabaseAdminClient().from("donor_profiles").select("first_name, last_name").eq("user_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const liveTiers = withinActiveWindow(tiers ?? []);
  const sponsorId = /^[0-9a-f-]{36}$/i.test(opts.sponsor ?? "") ? opts.sponsor : null;
  const { data: sponsor } = sponsorId
    ? await supabase.from("sponsorships").select("id, monthly_amount_cents, project_id").eq("id", sponsorId).eq("status", "active").maybeSingle()
    : { data: null };
  const freq = opts.frequency === "monthly" || opts.frequency === "yearly" ? opts.frequency : "one_time";

  const config: FlowConfig = {
    tiers: liveTiers, projects: projects ?? [],
    customEnabled: settings.custom_amount_enabled, minCents: settings.min_donation_cents, maxCents: settings.max_donation_cents,
    publishableKey: publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
    defaults: { firstName: profile?.first_name ?? "", lastName: profile?.last_name ?? "" },
    signedInEmail: user?.email ?? null,
    sponsorship: sponsor ? { id: sponsor.id, amountCents: sponsor.monthly_amount_cents, remainingCents: remainingCents(sponsor.monthly_amount_cents, (await heldCentsByProject()).get(sponsor.project_id) ?? 0) } : null,
    initialFrequency: sponsor && freq === "yearly" ? "monthly" : sponsor && !opts.frequency ? "monthly" : freq,
    initialProjectId: (projects ?? []).some((p) => p.id === opts.project) ? opts.project! : null,
  };
  // Sponsorship gifts keep their own dedicated flow; a form template only decorates the general/project flow.
  // An embed code names its form directly (?form=); otherwise campaign → project → default.
  const named = !sponsor && opts.form ? await formTemplateById(opts.form) : null;
  const template = sponsor ? null : named ?? await resolveFormTemplate({ projectId: config.initialProjectId, campaignId: opts.campaign });
  return { state: "ready", config, template: template ?? null };
}

function withinActiveWindow<T extends { active_from: string | null; active_until: string | null }>(rows: T[]) {
  const now = Date.now();
  return rows.filter((t) => (!t.active_from || +new Date(t.active_from) <= now) && (!t.active_until || +new Date(t.active_until) >= now));
}

/**
 * True when the visitor is signed in with a donor profile. They give from their account's Give page instead, using a
 * saved card or bank account, so the public form (and the home page pop-up) send them there.
 */
export async function hasDonorAccount(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const user = await getUser();
  if (!user) return false;
  const supabase = await createSupabaseServerClient(); // row-level security: only their own profile
  const { data } = await supabase.from("donor_profiles").select("id").eq("user_id", user.id).is("deleted_at", null).maybeSingle();
  return !!data;
}
