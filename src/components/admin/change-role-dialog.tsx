"use client";

import { useActionState, useRef, useState } from "react";
import { X } from "lucide-react";
import { setStaffRoles } from "@/lib/admin/staff-actions";

/** "Change role" button for one staff member; opens a pop-up with every role as a checkbox (current roles ticked). */
export function ChangeRoleButton({ userId, name, roles, current }: {
  userId: string; name: string; roles: { id: string; name: string }[]; current: string[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(0); // remount the form on each open so it reflects the latest roles
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" onClick={() => { setKey((k) => k + 1); ref.current?.showModal(); }}
        className="min-h-11 rounded-md border-2 border-teal-800 px-5 font-semibold text-teal-800 hover:bg-paper-2">
        Change role
      </button>
      <dialog ref={ref} aria-labelledby={`role-title-${userId}`} onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50">
        <div className="relative p-5 sm:p-6">
          <button type="button" onClick={close} className="absolute right-4 top-3 inline-flex min-h-11 items-center gap-1 font-semibold text-teal-600 hover:underline">
            Close<X aria-hidden="true" size={18} />
          </button>
          <RoleForm key={key} userId={userId} name={name} roles={roles} current={current} onDone={close} />
        </div>
      </dialog>
    </>
  );
}

function RoleForm({ userId, name, roles, current, onDone }: {
  userId: string; name: string; roles: { id: string; name: string }[]; current: string[]; onDone: () => void;
}) {
  const [state, action, pending] = useActionState(async (s: Awaited<ReturnType<typeof setStaffRoles>>, f: FormData) => {
    const r = await setStaffRoles(s, f);
    if (r?.ok) onDone();
    return r;
  }, undefined);
  return (
    <form action={action} className="mt-6">
      <h2 id={`role-title-${userId}`} className="text-2xl font-bold">Change role</h2>
      <p className="mt-1 text-ink-soft">Choose the roles for <span className="font-semibold text-ink">{name}</span>. Their access is the combination of every role ticked.</p>
      <input type="hidden" name="userId" value={userId} />
      <fieldset className="mt-4">
        <legend className="sr-only">Roles</legend>
        <div className="space-y-1">
          {roles.map((r) => (
            <label key={r.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line px-3 has-[:checked]:border-teal-800 has-[:checked]:bg-paper-2">
              <input type="checkbox" name="roleId" value={r.id} defaultChecked={current.includes(r.id)} className="size-4" />
              <span>{r.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div role="status" aria-live="polite">{state?.error && <p className="mt-3 rounded-md bg-danger-bg p-3 text-danger">{state.error}</p>}</div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-teal-800 px-6 font-bold text-white hover:bg-teal-800/90 disabled:opacity-60">{pending ? "Saving…" : "Save and close"}</button>
        <button type="button" onClick={onDone} className="min-h-11 rounded-full border-2 border-teal-800 px-6 font-bold text-teal-800 hover:bg-paper-2">Close</button>
      </div>
    </form>
  );
}
