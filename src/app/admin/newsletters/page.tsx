import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createNewsletter } from "@/lib/comms/newsletter-actions";
import { previewAudience } from "@/lib/comms/send";
import { getOrgSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Newsletters" };

const STATUS: Record<string, string> = { draft: "Draft", scheduled: "Scheduled", sending: "Sending", sent: "Sent", canceled: "Canceled" };

export default async function NewslettersPage() {
  await requirePermission("comms.send");
  const db = createSupabaseAdminClient();
  const [list, audience, settings] = await Promise.all([
    db.from("communication_campaigns").select("id, subject, status, scheduled_for, sent_at, recipient_count, created_at, updated_at")
      .not("design", "is", null).order("created_at", { ascending: false }).limit(200),
    previewAudience({ kind: "announcement", audience: {} }),
    getOrgSettings(),
  ]);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: settings.timezone }) : "");
  const rows = list.data ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Newsletters</h1>
        <form action={createNewsletter}>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-md bg-teal-800 px-5 font-semibold text-white hover:bg-teal-800/90"><Plus size={18} aria-hidden="true" />New newsletter</button>
        </form>
      </div>
      <p className="mt-2 max-w-prose text-ink-soft">
        Build a newsletter from blocks, preview it, send yourself a test, then send or schedule it. Newsletters go to every
        donor with <strong>News emails</strong> turned on: currently <strong>{audience.count.toLocaleString("en-US")}</strong>{" "}
        {audience.count === 1 ? "donor" : "donors"}. Do-not-contact, unsubscribed and bounced addresses are always left out.
      </p>
      {list.error && <p role="alert" className="mt-4 rounded-md bg-warning-bg p-3 text-warning">Apply database migration 0028 (newsletters) to use the newsletter builder.</p>}

      {rows.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-line p-10 text-center text-ink-soft">No newsletters yet. Select <strong>New newsletter</strong> to start from a ready-made layout.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
          <table className="w-full min-w-[40rem] text-left">
            <caption className="sr-only">Newsletters</caption>
            <thead><tr className="border-b-2 border-ink">{["Subject", "Status", "Date", "Recipients"].map((h, i) => <th key={h} scope="col" className={`px-4 py-3 ${i === 3 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((n) => (
              <tr key={n.id} className="border-b border-line last:border-0 hover:bg-paper-2">
                <td className="px-4 py-3"><Link className="font-semibold text-teal-600 hover:underline" href={`/admin/newsletters/${n.id}`}>{n.subject}</Link></td>
                <td className="px-4 py-3">{STATUS[n.status] ?? n.status}</td>
                <td className="px-4 py-3 tabular-nums">{n.status === "sent" ? when(n.sent_at) : n.status === "scheduled" ? `for ${when(n.scheduled_for)}` : `edited ${when(n.updated_at)}`}</td>
                <td className="px-4 py-3 text-right tabular-nums">{n.recipient_count ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
