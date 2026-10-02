"use client";

import { useActionState, useRef, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { inviteStaff } from "@/lib/admin/staff-actions";

const field = "min-h-11 w-full rounded-md border border-ink-soft/60 bg-white px-3";

/** "Invite staff" button (Staff page, top right) and its pop-up. Sends the invitation in place, then shows the result. */
export function InviteStaffButton({ roles }: { roles: { id: string; name: string }[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(0); // remount the form on each open so it starts empty
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" onClick={() => { setKey((k) => k + 1); ref.current?.showModal(); }}
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-teal-800 px-5 font-semibold text-white hover:bg-teal-800/90">
        <UserPlus aria-hidden="true" size={18} />Invite staff
      </button>
      <dialog ref={ref} aria-labelledby="invite-title" onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50">
        <div className="relative p-5 sm:p-6">
          <button type="button" onClick={close} className="absolute right-4 top-3 inline-flex min-h-11 items-center gap-1 font-semibold text-teal-600 hover:underline">
            Close<X aria-hidden="true" size={18} />
          </button>
          <InviteForm key={key} roles={roles} onClose={close} />
        </div>
      </dialog>
    </>
  );
}

function InviteForm({ roles, onClose }: { roles: { id: string; name: string }[]; onClose: () => void }) {
  const [state, action, pending] = useActionState(inviteStaff, undefined);

  if (state?.ok) {
    return (
      <div className="mt-6">
        <h2 id="invite-title" className="text-2xl font-bold">Invitation sent</h2>
        <p role="status" className="mt-3 rounded-md bg-success-bg p-3 text-success">{state.message}</p>
        <p className="mt-3 text-ink-soft">They&apos;ll get an email to choose their own password, then appear in the staff list.</p>
        <button type="button" onClick={onClose} className="mt-6 min-h-11 rounded-full bg-teal-800 px-6 font-bold text-white hover:bg-teal-800/90">Done</button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6">
      <h2 id="invite-title" className="text-2xl font-bold">Invite staff</h2>
      <p className="mt-1 text-ink-soft">They receive an email invitation and choose their own password.</p>
      <label htmlFor="invite-name" className="mt-5 block font-semibold">Name</label>
      <input id="invite-name" name="name" required maxLength={80} autoComplete="off" className={field} />
      <label htmlFor="invite-email" className="mt-4 block font-semibold">Email</label>
      <input id="invite-email" name="email" type="email" required maxLength={200} autoComplete="off" className={field} />
      <label htmlFor="invite-role" className="mt-4 block font-semibold">Role</label>
      <select id="invite-role" name="roleId" required className={field}>
        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <div role="status" aria-live="polite">{state?.error && <p className="mt-3 rounded-md bg-danger-bg p-3 text-danger">{state.error}</p>}</div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-teal-800 px-6 font-bold text-white hover:bg-teal-800/90 disabled:opacity-60">{pending ? "Sending…" : "Send invitation"}</button>
        <button type="button" onClick={onClose} className="min-h-11 rounded-full border-2 border-teal-800 px-6 font-bold text-teal-800 hover:bg-paper-2">Cancel</button>
      </div>
    </form>
  );
}
