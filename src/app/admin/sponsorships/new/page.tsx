import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { SponsorshipForm } from "@/components/admin/sponsorship-form";

export const metadata = { title: "Add a woman" };

export default async function NewSponsorshipPage() {
  await requirePermission("projects.manage");
  return (
    <>
      <p><Link className="underline" href="/admin/sponsorships">← All sponsorships</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">Add a woman to sponsor</h1>
      <div className="mt-6 max-w-2xl"><SponsorshipForm /></div>
    </>
  );
}
