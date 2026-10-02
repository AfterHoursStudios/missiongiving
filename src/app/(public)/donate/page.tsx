import { redirect } from "next/navigation";
import { DonateFlow } from "@/components/donate/donate-flow";
import { hasDonorAccount, loadDonateSetup } from "@/lib/donations/donate-config";

export const metadata = { title: "Donate", alternates: { canonical: "/donate" } };
export const dynamic = "force-dynamic";

export default async function DonatePage({ searchParams }: { searchParams: Promise<{ frequency?: string; project?: string; sponsor?: string; campaign?: string }> }) {
  const sp = await searchParams;
  // Signed-in donors give from their account with a saved card or bank account (no card entry, no pop-up).
  if (await hasDonorAccount()) {
    const q = new URLSearchParams();
    for (const k of ["sponsor", "project", "frequency"] as const) if (sp[k]) q.set(k, sp[k]!);
    redirect(`/dashboard/give${q.size ? `?${q}` : ""}`);
  }
  const setup = await loadDonateSetup(sp);
  if (setup.state === "unconfigured") {
    return <Shell><p className="rounded-md bg-warning-bg p-4 text-warning">This site is not connected to its database yet. See the README setup steps.</p></Shell>;
  }
  if (setup.state === "sign-in") return <Shell><SignInToGive /></Shell>;
  return <Shell><DonateFlow config={setup.config} template={setup.template ?? undefined} /></Shell>;
}

/** Shown when guest checkout is off (Admin → Settings) and the visitor isn't signed in. */
function SignInToGive() {
  return (
    <>
      <p className="max-w-prose text-lg">Please sign in or create a free account to give. It lets you see your history, download receipts and manage recurring gifts.</p>
      <div className="mt-6 flex gap-4">
        <a className="min-h-12 rounded-md bg-brand-700 px-7 py-3 font-semibold text-white" href="/sign-in?next=/donate">Sign in</a>
        <a className="min-h-12 rounded-md border-2 border-teal-800 px-7 py-3 font-semibold text-teal-800" href="/register">Create account</a>
      </div>
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-8 text-4xl font-semibold">Give to Ultimate Mission</h1>
      {children}
    </div>
  );
}
