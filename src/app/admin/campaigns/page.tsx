import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  await requirePermission("comms.send");
  const { data } = await createSupabaseAdminClient().from("communication_campaigns")
    .select("id, subject, kind, status, scheduled_for, sent_at, recipient_count, created_at").order("created_at", { ascending: false }).limit(100);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Campaigns</h1>
        <Link href="/admin/campaigns/new" className="min-h-11 rounded-md bg-brand-700 px-5 py-2.5 font-semibold text-white">New campaign</Link>
      </div>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">Announcements and project updates to donors who opted in. Receipts and payment notices are separate and are never sent from here.</p>
      {(data ?? []).length === 0 ? <p className="mt-8 border-y border-line py-10 text-center text-ink-soft">No campaigns yet.</p> : (
        <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[40rem] text-left">
          <caption className="sr-only">Campaigns</caption>
          <thead><tr className="border-b-2 border-ink">{["Subject", "Type", "Status", "Recipients", "When"].map((h) => <th key={h} scope="col" className="py-2 pr-4">{h}</th>)}</tr></thead>
          <tbody>{(data ?? []).map((c) => (
            <tr key={c.id} className="border-b border-line">
              <td className="py-3 pr-4"><Link className="font-semibold underline" href={`/admin/campaigns/${c.id}`}>{c.subject}</Link></td>
              <td className="py-3 pr-4">{c.kind === "project_update" ? "Project update" : "Announcement"}</td>
              <td className="py-3 pr-4">{c.status}</td>
              <td className="py-3 pr-4">{c.recipient_count ?? "—"}</td>
              <td className="py-3">{new Date(c.sent_at ?? c.scheduled_for ?? c.created_at).toLocaleString("en-US")}</td>
            </tr>))}</tbody></table></div>
      )}
    </>
  );
}
