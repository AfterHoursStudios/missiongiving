import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { FREQUENCY_LABEL, StatusDot } from "@/components/donor/ui";
import { formatMoney, netSettledCents } from "@/lib/money";
import { ListPanel, Pager, paginate, pillCls, tdCls, thCls } from "./ui";
import type { GiftRow } from "./gifts-tab";

export interface PledgeRow {
  id: string; amount_cents: number; frequency: string; status: string; created_at: string;
  next_charge_at: string | null; canceled_at: string | null; cancel_reason: string | null; project: string | null;
}

const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—");

/** Recurring gifts the donor has signed up for, with what each has actually paid so far (settled, net of refunds). */
export function PledgesTab({ donorId, pledges, gifts, page, canGift }: { donorId: string; pledges: PledgeRow[]; gifts: GiftRow[]; page: number; canGift: boolean }) {
  const rows = [...pledges].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { slice, page: p, pages } = paginate(rows, page);
  const paidBy = (id: string) => {
    const mine = gifts.filter((g) => g.recurring_id === id);
    const settled = mine.filter((g) => ["succeeded", "partially_refunded", "refunded"].includes(g.status));
    return { cents: netSettledCents(mine), count: settled.length, last: settled[0]?.donated_at ?? null }; // gifts arrive newest first
  };

  return (
    <ListPanel
      title="Pledge List"
      total={rows.length}
      actions={canGift && <Link className={pillCls} href={`/admin/virtual-terminal?donor=${donorId}`}><PlusCircle aria-hidden="true" size={18} />Add pledge</Link>}
      pager={<Pager page={p} pages={pages} href={(n) => `/admin/donors/${donorId}?tab=pledges&page=${n}`} />}
    >
      {rows.length === 0 ? <p className="px-4 py-10 text-center text-ink-soft">No recurring gifts.</p> : (
        <table className="w-full min-w-[60rem] text-left">
          <caption className="sr-only">Recurring gifts</caption>
          <thead><tr>
            {["Pledge Date", "Billing Amount", "Frequency", "Designation", "Status", "Payments", "Total Paid", "Last Payment", "Next Charge"].map((h) => (
              <th key={h} scope="col" className={`${thCls} ${["Billing Amount", "Payments", "Total Paid"].includes(h) ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{slice.map((r) => {
            const paid = paidBy(r.id);
            const live = ["active", "past_due"].includes(r.status);
            return (
              <tr key={r.id} className="border-b border-line">
                <td className={`${tdCls} tabular-nums`}>{date(r.created_at)}</td>
                <td className={`${tdCls} text-right tabular-nums`}>{formatMoney(r.amount_cents)}</td>
                <td className={tdCls}>{FREQUENCY_LABEL[r.frequency] ?? r.frequency}</td>
                <td className={tdCls}>{r.project ?? "General Fund"}</td>
                <td className={tdCls}>
                  <StatusDot status={r.status} />
                  {r.canceled_at && <span className="block text-sm text-ink-soft">ended {date(r.canceled_at)}{r.cancel_reason ? ` · ${r.cancel_reason}` : ""}</span>}
                </td>
                <td className={`${tdCls} text-right tabular-nums`}>{paid.count}</td>
                <td className={`${tdCls} text-right tabular-nums`}>{formatMoney(paid.cents)}</td>
                <td className={`${tdCls} tabular-nums`}>{date(paid.last)}</td>
                <td className={`${tdCls} tabular-nums`}>{live ? date(r.next_charge_at) : "—"}</td>
              </tr>
            );
          })}</tbody>
        </table>
      )}
    </ListPanel>
  );
}
