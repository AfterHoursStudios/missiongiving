import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { isPlaceholderEmail } from "@/lib/admin/dp-import";
import { listPaymentMethods } from "@/lib/admin/payment-on-file";
import { VirtualTerminalForm, type TerminalDonor } from "@/components/admin/virtual-terminal-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Take a gift by phone or mail" };

export default async function VirtualTerminalPage({ searchParams }: { searchParams: Promise<{ donor?: string; frequency?: string }> }) {
  const { perms } = await requirePermission("finance.view");
  const sp = await searchParams;
  const db = createSupabaseAdminClient();
  const [{ data: projects }, donorRow] = await Promise.all([
    db.from("projects").select("id, title").neq("status", "archived").neq("kind", "sponsorship").order("title"),
    sp.donor ? db.from("donor_profiles").select("id, first_name, last_name, email, stripe_customer_id").eq("id", sp.donor).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const donor: TerminalDonor | undefined = donorRow.data
    ? { id: donorRow.data.id, firstName: donorRow.data.first_name, lastName: donorRow.data.last_name, email: isPlaceholderEmail(donorRow.data.email) ? "" : donorRow.data.email }
    : undefined;

  // Saved cards/bank accounts on the donor's Stripe customer, so staff can charge one without re-entering it.
  const saved = donorRow.data ? await listPaymentMethods(donorRow.data.stripe_customer_id) : { methods: [] };

  // Gifts → One-time gift opens this page with ?frequency=one_time: the gift is single, with no monthly/yearly choice.
  const oneTimeOnly = sp.frequency === "one_time";

  return (
    <>
      <h1 className="text-3xl font-semibold">{oneTimeOnly ? "Take a one-time gift" : "Take a gift by phone or mail"}{donor && ` for ${donor.firstName} ${donor.lastName}`}</h1>
      <p className="mt-2 max-w-prose text-ink-soft">
        For a donor giving you their card or bank account details directly (by phone or mail). Their card or bank details go
        straight into Stripe&apos;s secure fields on the next screen — never typed anywhere else, never stored here.
        For checks, cash or wire, use <a className="underline" href="/admin/offline-gift">Record offline gift</a> instead.
      </p>
      {!perms.has("expenses.record") && <p role="alert" className="mt-4 rounded-md bg-warning-bg p-3 text-warning">Your role can view finance data but cannot record entries.</p>}
      <div className="mt-6"><VirtualTerminalForm projects={projects ?? []} publishableKey={publicEnv.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null} donor={donor} savedMethods={saved.methods} oneTimeOnly={oneTimeOnly} /></div>
    </>
  );
}
