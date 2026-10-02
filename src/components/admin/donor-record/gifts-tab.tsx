import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { resendReceipt } from "@/lib/admin/donor-actions";
import { refundDonation } from "@/lib/admin/finance-actions";
import { validateRefund } from "@/lib/admin/finance-logic";
import { SimpleForm, TextInput } from "@/components/donor/forms";
import { StatusBadge, FREQUENCY_LABEL, METHOD_LABEL } from "@/components/donor/ui";
import { formatMoney } from "@/lib/money";
import { InlineAction } from "./client";
import { ListPanel, Pager, paginate, pillCls, tdCls, thCls, linkCls } from "./ui";

export interface GiftRow {
  id: string; amount_cents: number; refunded_cents: number; status: string; stripe_payment_intent_id: string | null; frequency: string;
  payment_method: string; donated_at: string; recurring_id: string | null; is_offline: boolean;
  project: string | null; receipt: { receipt_number: string; is_final: boolean; delivery_history: unknown[] } | null;
}

/** Statuses hidden unless "show failed transactions" is on: attempts that never became a payment. */
const NOT_A_PAYMENT = new Set(["failed", "canceled", "pending"]);
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

export function GiftsTab({ donorId, gifts, page, showFailed, canEdit, canRefund, canGift }: {
  donorId: string; gifts: GiftRow[]; page: number; showFailed: boolean; canEdit: boolean; canRefund: boolean; canGift: boolean;
}) {
  const rows = showFailed ? gifts : gifts.filter((g) => !NOT_A_PAYMENT.has(g.status));
  const { slice, page: p, pages } = paginate(rows, page);
  const base = `/admin/donors/${donorId}?tab=gifts${showFailed ? "&failed=1" : ""}`;

  return (
    <ListPanel
      title="Gift List"
      total={rows.length}
      actions={canGift && (
        <details className="relative">
          <summary className={`${pillCls} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}><PlusCircle aria-hidden="true" size={18} />Add gift</summary>
          <ul className="absolute left-0 top-full z-20 mt-1 min-w-56 rounded-md border border-line bg-white py-1 shadow-md">
            <li><Link className="block min-h-11 px-4 py-2.5 hover:bg-paper-2" href={`/admin/virtual-terminal?donor=${donorId}`}>Card or bank (phone/mail)</Link></li>
            <li><Link className="block min-h-11 px-4 py-2.5 hover:bg-paper-2" href="/admin/offline-gift">Check or cash (offline)</Link></li>
          </ul>
        </details>
      )}
      toolbar={(
        <fieldset className="flex flex-wrap gap-x-5">
          <legend className="sr-only">Which transactions to show</legend>
          <FilterRadio href={`/admin/donors/${donorId}?tab=gifts`} on={!showFailed}>Show gifts</FilterRadio>
          <FilterRadio href={`/admin/donors/${donorId}?tab=gifts&failed=1`} on={showFailed}>Show gifts and failed transactions</FilterRadio>
        </fieldset>
      )}
      pager={<Pager page={p} pages={pages} href={(n) => `${base}&page=${n}`} />}
    >
      {rows.length === 0 ? <p className="px-4 py-10 text-center text-ink-soft">No gifts yet.</p> : (
        <table className="w-full min-w-[60rem] text-left">
          <caption className="sr-only">Gifts</caption>
          <thead><tr>
            {["Date of Gift", "Gift Amount", "Type of Gift", "Designation", "Recurring", "Status", "Receipt"].map((h, i) => <th key={h} scope="col" className={`${thCls} ${i === 1 ? "text-right" : ""}`}>{h}</th>)}
            {canRefund && <th scope="col" className={thCls}><span className="sr-only">Actions</span></th>}
          </tr></thead>
          <tbody>{slice.map((g) => {
            const rc = g.receipt;
            const refundable = canRefund && !validateRefund({ status: g.status, payment_method: g.payment_method, amount_cents: g.amount_cents, refunded_cents: g.refunded_cents, has_payment_intent: !!g.stripe_payment_intent_id }, 1);
            const left = ((g.amount_cents - g.refunded_cents) / 100).toFixed(2);
            return (
              <tr key={g.id} className="border-b border-line">
                <td className={`${tdCls} tabular-nums`}>{date(g.donated_at)}</td>
                <td className={`${tdCls} text-right tabular-nums`}>{formatMoney(g.amount_cents)}{g.refunded_cents > 0 && <span className="block text-sm text-warning">−{formatMoney(g.refunded_cents)} refunded</span>}</td>
                <td className={tdCls}>{METHOD_LABEL[g.payment_method] ?? g.payment_method}{g.is_offline && g.payment_method !== "offline" ? " (offline)" : ""}<span className="block text-sm text-ink-soft">{FREQUENCY_LABEL[g.frequency] ?? g.frequency}</span></td>
                <td className={tdCls}>{g.project ?? "General Fund"}</td>
                <td className={tdCls}>{g.recurring_id ? "Y" : ""}</td>
                <td className={tdCls}><StatusBadge status={g.status} /></td>
                <td className={tdCls}>
                  {rc ? (<>
                    <a className={linkCls} href={`/receipts/${g.id}/pdf`}>{rc.receipt_number}</a>
                    <span className="block text-sm text-ink-soft">{rc.is_final ? "Final" : "Pending"} · sent {rc.delivery_history?.length ?? 0}×</span>
                    {canEdit && rc.is_final && <InlineAction action={resendReceipt} fields={{ donationId: g.id }} label="Resend" />}
                  </>) : <span className="text-ink-soft">—</span>}
                </td>
                {canRefund && (
                  <td className={tdCls}>
                    {refundable && (
                      <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-danger underline">Refund</summary>
                        <div className="mt-2 w-56"><SimpleForm action={refundDonation} submit="Submit refund" tone="danger">
                          <input type="hidden" name="donationId" value={g.id} />
                          <TextInput label={`Amount (max ${left})`} name="amount" defaultValue={left} />
                          <TextInput label="Reason" name="reason" />
                        </SimpleForm></div>
                      </details>
                    )}
                  </td>
                )}
              </tr>
            );
          })}</tbody>
        </table>
      )}
    </ListPanel>
  );
}

/** A radio-styled link: the filter is a page link (works without JS), drawn like the CRM's radio choice. */
function FilterRadio({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={on ? "true" : undefined} className="inline-flex min-h-11 items-center gap-2 hover:underline">
      <span aria-hidden="true" className={`inline-flex size-4 items-center justify-center rounded-full border-2 ${on ? "border-teal-800" : "border-ink-soft"}`}>{on && <span className="size-2 rounded-full bg-teal-800" />}</span>
      {children}
    </Link>
  );
}
