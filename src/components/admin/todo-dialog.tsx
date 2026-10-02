"use client";

import Link from "next/link";
import { createContext, useActionState, useContext, useRef, useState } from "react";
import { Clock, DollarSign, Gift, PlusCircle, User, X } from "lucide-react";
import { createTodo } from "@/lib/admin/todo-actions";
import { TODO_ACTIVITIES, TODO_TIMES } from "@/lib/admin/todos";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";

export interface TodoDonor {
  id: string; name: string; status: string; phone: string | null; email: string;
  lastGiftCents: number | null; lastGiftAt: string | null; giftCount: number; lifetimeCents: number;
}
export interface TodoStaff { id: string; name: string }

const Ctx = createContext<((d: TodoDonor) => void) | null>(null);

/**
 * One shared "Create to-do" pop-up for a list of donors. Rows open it with <CreateTodoButton>; it saves in place
 * (a server action) and closes, so staff never leave the list.
 */
export function TodoDialogProvider({ staff, me, children }: { staff: TodoStaff[]; me: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [donor, setDonor] = useState<TodoDonor | null>(null);
  const [opened, setOpened] = useState(0); // remounts the form each time so it starts empty
  const [saved, setSaved] = useState<string | null>(null);

  const open = (d: TodoDonor) => { setDonor(d); setOpened((n) => n + 1); setSaved(null); ref.current?.showModal(); };
  const close = () => ref.current?.close();

  return (
    <Ctx.Provider value={open}>
      {saved && <p role="status" className="mb-3 rounded-md bg-success-bg p-3 text-success">To-do saved for {saved}.</p>}
      {children}
      <dialog ref={ref} aria-labelledby="todo-title"
        onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(58rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-ink/50">
        {donor && (
          <div className="relative p-5 sm:p-6">
            <button type="button" onClick={close} className="absolute right-4 top-3 inline-flex min-h-11 items-center gap-1 font-semibold text-teal-600 hover:underline">
              Close<X aria-hidden="true" size={18} />
            </button>
            <div className="mt-8 grid gap-6 md:grid-cols-[18rem_minmax(0,1fr)]">
              <DonorSummary donor={donor} />
              <TodoForm key={opened} donor={donor} staff={staff} me={me} onCancel={close}
                onSaved={() => { setSaved(donor.name); close(); }} />
            </div>
          </div>
        )}
      </dialog>
    </Ctx.Provider>
  );
}

/**
 * Opens the pop-up for one donor. "hover" (list rows) shows only while the row is hovered or keyboard-focused (not after a mouse click), so the list
 * stays clean; it is always shown on touch screens. "pill" is an always-visible add button.
 */
export function CreateTodoButton({ donor, variant = "hover" }: { donor: TodoDonor; variant?: "hover" | "pill" }) {
  const open = useContext(Ctx);
  if (!open) return null;
  if (variant === "pill") {
    return (
      <button type="button" onClick={() => open(donor)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-teal-800 px-5 font-bold text-teal-800 hover:bg-paper-2">
        <PlusCircle aria-hidden="true" size={18} />Create to-do
      </button>
    );
  }
  return (
    <button type="button" onClick={() => open(donor)} aria-label={`Create to-do for ${donor.name}`}
      className="shrink-0 rounded-full border border-teal-800 px-3 py-1 text-sm font-semibold text-teal-800 opacity-0 transition-opacity hover:bg-teal-800 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 pointer-coarse:opacity-100">
      Create to-do
    </button>
  );
}

const STATUS_TEXT: Record<string, string> = { active: "text-success", lapsed: "text-warning", inactive: "text-ink-soft", do_not_contact: "text-danger" };

function DonorSummary({ donor }: { donor: TodoDonor }) {
  const stat = (Icon: typeof Clock, tone: string, label: string, value: string, hint?: string) => (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-white p-3">
      <span aria-hidden="true" className={cn("mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white", tone)}><Icon size={15} /></span>
      <div className="min-w-0 flex-1"><p>{label}</p><p className="flex flex-wrap justify-between gap-x-2"><span className="font-bold tabular-nums">{value}</span>{hint && <span className="text-sm text-ink-soft">{hint}</span>}</p></div>
    </div>
  );
  return (
    <aside aria-label="Donor summary" className="rounded-xl bg-paper-2 p-4">
      <div className="rounded-xl border border-line bg-white p-4">
        <div className="flex gap-3">
          <div className="flex flex-col items-center gap-1">
            <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-full bg-paper-2 text-ink-soft"><User size={28} /></span>
            <span className={cn("text-xs font-bold uppercase", STATUS_TEXT[donor.status] ?? "text-ink-soft")}>{donor.status.replace(/_/g, " ")}</span>
          </div>
          <p className="font-bold">{donor.name}</p>
        </div>
        {donor.phone && <p className="mt-2">{formatPhone(donor.phone)}</p>}
        <p className="mt-1 break-all text-sm">{donor.email ? <a className="text-teal-600 underline" href={`mailto:${donor.email}`}>{donor.email}</a> : <span className="italic text-ink-soft">No email on file</span>}</p>
      </div>
      <p className="mt-3 flex justify-between gap-2 px-1 text-sm font-semibold">
        <Link className="text-teal-600 hover:underline" href={`/admin/donors/${donor.id}`}>View donor record</Link>
        <Link className="text-teal-600 hover:underline" href={`/admin/donors/${donor.id}?tab=contacts`}>View contacts</Link>
      </p>
      <div className="mt-3 space-y-3">
        {stat(Clock, "bg-gold", "Last gift", donor.lastGiftCents != null ? formatMoney(donor.lastGiftCents) : "—",
          donor.lastGiftAt ? new Date(donor.lastGiftAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : undefined)}
        {stat(Gift, "bg-teal-600", "Total gifts", String(donor.giftCount))}
        {stat(DollarSign, "bg-success", "Total given", formatMoney(donor.lifetimeCents))}
      </div>
    </aside>
  );
}

const field = "min-h-11 w-full rounded-md border border-ink-soft/60 bg-white px-3";
const Req = () => <><span aria-hidden="true" className="text-danger"> *</span><span className="sr-only"> (required)</span></>;

function TodoForm({ donor, staff, me, onSaved, onCancel }: { donor: TodoDonor; staff: TodoStaff[]; me: string; onSaved: () => void; onCancel: () => void }) {
  const [state, action, pending] = useActionState(async (s: Awaited<ReturnType<typeof createTodo>>, f: FormData) => {
    const r = await createTodo(s, f);
    if (r?.ok) onSaved();
    return r;
  }, undefined);
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

  return (
    <form action={action} className="flex flex-col">
      <h2 id="todo-title" className="text-3xl font-bold">Create to-do</h2>
      <p className="mt-3 text-ink-soft">This to-do will be saved to the donor&apos;s contact record and added to the assigned person&apos;s outreach list on the dashboard.</p>
      <input type="hidden" name="donorId" value={donor.id} />

      <label htmlFor="todo-activity" className="mt-5 block font-semibold">Activity<Req /></label>
      <select id="todo-activity" name="activity" required defaultValue="" className={field}>
        <option value="" disabled>Please choose…</option>
        {Object.entries(TODO_ACTIVITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <label htmlFor="todo-date" className="block font-semibold">Due date<Req /></label>
          <input id="todo-date" name="dueDate" type="date" required min={today} className={field} />
        </div>
        <div>
          <label htmlFor="todo-time" className="flex justify-between font-semibold">at time <span className="text-sm font-normal text-ink-soft">(optional)</span></label>
          <select id="todo-time" name="dueTime" defaultValue="" className={field}>
            <option value="">—</option>
            {TODO_TIMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <label htmlFor="todo-assignee" className="mt-4 block font-semibold">Assigned to<Req /></label>
      <select id="todo-assignee" name="assignedTo" required defaultValue={staff.some((s) => s.id === me) ? me : ""} className={field}>
        <option value="" disabled>Please choose…</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === me ? " (me)" : ""}</option>)}
      </select>

      <label htmlFor="todo-notes" className="mt-4 flex justify-between font-semibold">Notes <span className="text-sm font-normal text-ink-soft">(optional)</span></label>
      <textarea id="todo-notes" name="notes" rows={4} maxLength={2000} aria-describedby="todo-notes-hint" className="w-full rounded-md border border-ink-soft/60 bg-white px-3 py-2" />
      <p id="todo-notes-hint" className="mt-1 text-sm text-ink-soft">Add any information that will be valuable in completing this activity.</p>

      <div role="status" aria-live="polite">{state?.error && <p className="mt-3 rounded-md bg-danger-bg p-3 text-danger">{state.error}</p>}</div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-teal-800 px-6 font-bold text-white hover:bg-teal-800/90 disabled:opacity-60">{pending ? "Saving…" : "Save and close"}</button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full border-2 border-teal-800 px-6 font-bold text-teal-800 hover:bg-paper-2">Close</button>
      </div>
    </form>
  );
}
