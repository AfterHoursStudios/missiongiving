import { ListPanel, Pager, paginate, pillCls, tdCls, thCls } from "./ui";
import { AddContactButton } from "@/components/admin/add-contact-dialog";
import { CreateTodoButton, type TodoDonor } from "@/components/admin/todo-dialog";
import { TodoTable, type TodoRow } from "@/components/admin/todo-list";

export interface CommRow { id: string; kind: string; channel: string; subject: string | null; detail: string | null; status: string; created_at: string; staff: string | null }
export interface CampaignRow { id: string; status: string; updated_at: string; campaign: { subject: string; kind: string; sent_at: string | null } | null }
export interface ContactRow { key: string; at: string; activity: string; channel: string; subject: string; status: string; detail: string | null; by: string | null }

const KIND_LABEL: Record<string, string> = {
  receipt: "Receipt & thank-you", thank_you: "Thank-you", message: "Message", payment_failed: "Payment failed notice",
  recurring_canceled: "Recurring gift ended notice", refund: "Refund notice",
};
const CHANNEL_LABEL: Record<string, string> = { email: "Email", mail: "Mail", phone: "Phone", in_person: "In person", other: "Other" };
const LOGGED_LABEL: Record<string, string> = { email: "Email (logged)", mail: "Letter mailed", phone: "Phone call", in_person: "Visit / meeting", other: "Other contact" };
const cap = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Every outgoing communication to the donor, newest first: system emails, staff messages, logged contacts and campaigns. */
export function buildContacts(comms: CommRow[], campaigns: CampaignRow[]): ContactRow[] {
  const rows: ContactRow[] = [
    ...comms.map((c) => ({
      key: `c-${c.id}`, at: c.created_at, activity: c.kind === "logged" ? LOGGED_LABEL[c.channel] ?? "Contact" : KIND_LABEL[c.kind] ?? cap(c.kind),
      channel: CHANNEL_LABEL[c.channel] ?? cap(c.channel), subject: c.subject ?? "", detail: c.detail,
      status: c.status === "skipped" ? "Not sent (email off)" : cap(c.status), by: c.staff,
    })),
    ...campaigns.map((r) => ({
      key: `r-${r.id}`, at: r.campaign?.sent_at ?? r.updated_at, activity: r.campaign?.kind === "project_update" ? "Project update" : "Campaign",
      channel: "Email", subject: r.campaign?.subject ?? "", detail: null, status: cap(r.status), by: null,
    })),
  ];
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

export function ContactsTab({ donorId, contacts, page, canEdit, logReady, todos, todoDonor, today }: {
  donorId: string; contacts: ContactRow[]; page: number; canEdit: boolean; logReady: boolean;
  todos: TodoRow[] | null; todoDonor: TodoDonor; today: string;
}) {
  const { slice, page: p, pages } = paginate(contacts, page);
  // Open to-dos first (soonest due), then completed ones (most recent first).
  const sortedTodos = [...(todos ?? [])].sort((a, b) => (!!a.completed_at === !!b.completed_at
    ? (a.completed_at ? b.completed_at!.localeCompare(a.completed_at) : a.due_date.localeCompare(b.due_date))
    : a.completed_at ? 1 : -1));
  return (
    <>
    <ListPanel title="To-Do List" total={sortedTodos.length} actions={canEdit && todos && <CreateTodoButton donor={todoDonor} variant="pill" />}>
      {!todos && <p className="bg-warning-bg px-4 py-2 text-sm text-warning">To-dos aren&apos;t set up yet (database migration 0014).</p>}
      {todos && (sortedTodos.length === 0 ? <p className="px-4 py-8 text-center text-ink-soft">No to-dos for this donor.</p>
        : <TodoTable todos={sortedTodos} canEdit={canEdit} today={today} />)}
    </ListPanel>
    <ListPanel
      title="Contact List"
      total={contacts.length}
      actions={canEdit && logReady && <AddContactButton donorId={donorId} className={`${pillCls} cursor-pointer`} />}
      pager={<Pager page={p} pages={pages} href={(n) => `/admin/donors/${donorId}?tab=contacts&page=${n}`} />}
    >
      {!logReady && <p className="bg-warning-bg px-4 py-2 text-sm text-warning">The communications log isn&apos;t set up yet (database migration 0013), so only campaign emails are listed.</p>}
      {contacts.length === 0 ? <p className="px-4 py-10 text-center text-ink-soft">No communications yet.</p> : (
        <table className="w-full min-w-[56rem] text-left">
          <caption className="sr-only">Communications sent to this donor</caption>
          <thead><tr>{["Contact Date", "Activity", "Channel", "Subject / Campaign Name", "Status", "Notes"].map((h) => <th key={h} scope="col" className={thCls}>{h}</th>)}</tr></thead>
          <tbody>{slice.map((c) => (
            <tr key={c.key} className="border-b border-line">
              <td className={`${tdCls} whitespace-nowrap tabular-nums`}>{date(c.at)}</td>
              <td className={tdCls}>{c.activity}</td>
              <td className={tdCls}>{c.channel}</td>
              <td className={tdCls}>{c.subject}</td>
              <td className={tdCls}>{c.status}</td>
              <td className={`${tdCls} max-w-xs text-sm`}>{c.detail}{c.by && <span className="block text-ink-soft">by {c.by}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </ListPanel>
    </>
  );
}
