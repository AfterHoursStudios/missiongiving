import Link from "next/link";
import { setTodoDone } from "@/lib/admin/todo-actions";
import { STAFF_TODO_LABEL, TODO_ACTIVITIES, formatTodoTime, type TodoActivity } from "@/lib/admin/todos";
import { InlineAction } from "@/components/admin/donor-record/client";
import { cn } from "@/lib/utils";

export interface TodoRow {
  id: string; donor_id: string | null; activity: string; due_date: string; due_time: string | null; notes: string | null;
  completed_at: string | null; assignee: string | null; donor_name?: string | null; title?: string | null;
}

const th = "whitespace-nowrap bg-paper-2/60 px-3 py-2.5 text-sm font-semibold";
const td = "px-3 py-2.5 align-top";
/** due_date is a plain calendar date; format it without a timezone shift. */
const dueLabel = (d: string) => { const [y, m, day] = d.split("-"); return `${m}/${day}/${y}`; };

/** Outreach to-dos as a table. `showDonor` adds a donor column (dashboard); the donor record leaves it out. */
export function TodoTable({ todos, canEdit, showDonor = false, today }: { todos: TodoRow[]; canEdit: boolean; showDonor?: boolean; today: string }) {
  return (
    <table className="w-full min-w-[48rem] text-left">
      <caption className="sr-only">To-dos</caption>
      <thead><tr>
        {["Due Date", ...(showDonor ? ["Donor"] : []), "Activity", "Assigned To", "Notes", "Completed"].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}
        {canEdit && <th scope="col" className={th}><span className="sr-only">Actions</span></th>}
      </tr></thead>
      <tbody>{todos.map((t) => {
        const overdue = !t.completed_at && t.due_date < today;
        return (
          <tr key={t.id} className={cn("border-b border-line", t.completed_at && "text-ink-soft")}>
            <td className={cn(td, "whitespace-nowrap tabular-nums")}>
              {dueLabel(t.due_date)}{t.due_time && <span className="block text-sm">{formatTodoTime(t.due_time)}</span>}
              {overdue && <span className="block text-sm font-semibold text-danger">Overdue</span>}
            </td>
            {showDonor && <td className={td}>{t.donor_id
              ? <Link className="text-teal-600 hover:underline" href={`/admin/donors/${t.donor_id}?tab=contacts`}>{t.donor_name}</Link>
              : <span className="text-ink-soft">—<span className="sr-only">No donor</span></span>}</td>}
            <td className={td}>{t.title || (TODO_ACTIVITIES[t.activity as TodoActivity] ?? STAFF_TODO_LABEL)}</td>
            <td className={td}>{t.assignee ?? "—"}</td>
            <td className={cn(td, "max-w-xs whitespace-pre-wrap text-sm")}>{t.notes}</td>
            <td className={cn(td, "whitespace-nowrap tabular-nums")}>{t.completed_at ? new Date(t.completed_at).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : ""}</td>
            {canEdit && (
              <td className={cn(td, "whitespace-nowrap")}>
                <InlineAction action={setTodoDone} fields={{ id: t.id, done: t.completed_at ? "0" : "1" }} label={t.completed_at ? "Reopen" : "Mark done"} />
              </td>
            )}
          </tr>
        );
      })}</tbody>
    </table>
  );
}
