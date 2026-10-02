import { DonateFlow } from "@/components/donate/donate-flow";
import { loadDonateSetup } from "@/lib/donations/donate-config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Donate" };

/** The donation form for embedding on other sites: /embed/donate?form=<form id> (optionally &project=…). */
export default async function EmbedDonatePage({ searchParams }: { searchParams: Promise<{ form?: string; project?: string; frequency?: string }> }) {
  const sp = await searchParams;
  const setup = await loadDonateSetup({ form: sp.form, project: sp.project, frequency: sp.frequency });
  if (setup.state === "unconfigured") return <p className="rounded-md bg-warning-bg p-4 text-warning">Online giving isn&apos;t available right now.</p>;
  if (setup.state === "sign-in") {
    return (
      <p className="max-w-prose text-lg">
        Please <a className="font-semibold text-teal-600 underline" href="/donate" target="_top">give on our website</a>, where you can sign in or create a free account.
      </p>
    );
  }
  return <DonateFlow config={setup.config} template={setup.template ?? undefined} embedded />;
}
