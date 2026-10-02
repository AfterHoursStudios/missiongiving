"use client";

import { useActionState } from "react";
import { X } from "lucide-react";
import { createStaffTodo } from "@/lib/admin/todo-actions";
import { TODO_TIMES } from "@/lib/admin/todos";
import type { TodoStaff } from "./todo-dialog";

const field = "min-h-11 w-full rounded-md border border-ink-soft/60 bg-white px-3";
const Req = () => <><span aria-hidden="true" className="text-danger"> *</span><span className="sr-only"> (required)</span></>;

/**
 * "Add New → To-do": a pop-up for a staff to-do that isn't about a donor. The parent owns the <dialog> ref and opens it
 * with showModal(); `formKey` changes on each open so the form starts empty. Saves in place and closes.
 */
export function StaffTodoDialog({ dialogRef, formKey, staff, me, onSaved }: {
  dialogRef: React.RefObject<HTMLDialogElement | null>; formKey: number; staff: TodoStaff[]; me: string; onSaved?: () => void;
}) {
  const close = () => dialogRef.current?.close();
  return (
    <dialog ref={dialogRef} aria-labelledby="staff-todo-title" onClick={(e) => { if (e.target === dialogRef.current) close(); }}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50">
      <div className="relative p-5 sm:p-6">
        <button type="button" onClick={close} className="absolute right-4 top-3 inline-flex min-h-11 items-center gap-1 font-semibold text-teal-600 hover:underline">
          Close<X aria-hidden="true" size={18} />
        </button>
        <StaffTodoForm key={formKey} staff={staff} me={me} onCancel={close} onSaved={() => { close(); onSaved?.(); }} />
      </div>
    </dialog>
  );
}

function StaffTodoForm({ staff, me, onSaved, onCancel }: { staff: TodoStaff[]; me: string; onSaved: () => void; onCancel: () => void }) {
  const [state, action, pending] = useActionState(async (s: Awaited<ReturnType<typeof createStaffTodo>>, f: FormData) => {
    const r = await createStaffTodo(s, f);
    if (r?.ok) onSaved();
    return r;
  }, undefined);
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

  return (
    <form action={action} className="mt-6 flex flex-col">
      <h2 id="staff-todo-title" className="text-3xl font-bold">Create to-do</h2>
      <p className="mt-3 text-ink-soft">A to-do for a staff member that isn&apos;t about a particular donor. It&apos;s added to their to-do list on the dashboard.</p>

      <label htmlFor="staff-todo-title-input" className="mt-5 block font-semibold">What needs doing?<Req /></label>
      <input id="staff-todo-title-input" name="title" required maxLength={200} placeholder="e.g. Order thank-you cards" className={field} />

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <label htmlFor="staff-todo-date" className="block font-semibold">Due date<Req /></label>
          <input id="staff-todo-date" name="dueDate" type="date" required min={today} className={field} />
        </div>
        <div>
          <label htmlFor="staff-todo-time" className="flex justify-between font-semibold">at time <span className="text-sm font-normal text-ink-soft">(optional)</span></label>
          <select id="staff-todo-time" name="dueTime" defaultValue="" className={field}>
            <option value="">—</option>
            {TODO_TIMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <label htmlFor="staff-todo-assignee" className="mt-4 block font-semibold">Assigned to<Req /></label>
      <select id="staff-todo-assignee" name="assignedTo" required defaultValue={staff.some((s) => s.id === me) ? me : ""} className={field}>
        <option value="" disabled>Please choose…</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === me ? " (me)" : ""}</option>)}
      </select>

      <label htmlFor="staff-todo-notes" className="mt-4 flex justify-between font-semibold">Notes <span className="text-sm font-normal text-ink-soft">(optional)</span></label>
      <textarea id="staff-todo-notes" name="notes" rows={4} maxLength={2000} className="w-full rounded-md border border-ink-soft/60 bg-white px-3 py-2" />

      <div role="status" aria-live="polite">{state?.error && <p className="mt-3 rounded-md bg-danger-bg p-3 text-danger">{state.error}</p>}</div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-teal-800 px-6 font-bold text-white hover:bg-teal-800/90 disabled:opacity-60">{pending ? "Saving…" : "Save and close"}</button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full border-2 border-teal-800 px-6 font-bold text-teal-800 hover:bg-paper-2">Close</button>
      </div>
    </form>
  );
}
