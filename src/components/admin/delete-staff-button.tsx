"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteStaff } from "@/lib/admin/staff-actions";

/** Delete on the Staff page, confirmed inline (no browser pop-up). */
export function DeleteStaffButton({ userId, name }: { userId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(deleteStaff, undefined);
  if (!confirming) {
    return <button type="button" onClick={() => setConfirming(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 font-semibold text-danger hover:underline"><Trash2 size={16} aria-hidden="true" />Delete</button>;
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 rounded-md bg-danger-bg p-2 text-sm">
      <input type="hidden" name="userId" value={userId} />
      <span className="text-danger">Delete {name}? This can&apos;t be undone.</span>
      <button disabled={pending} className="min-h-11 rounded-md bg-danger px-3 font-semibold text-white disabled:opacity-60">{pending ? "Deleting…" : "Delete"}</button>
      <button type="button" onClick={() => setConfirming(false)} className="min-h-11 px-2 font-semibold text-teal-600 hover:underline">Cancel</button>
      {state?.error && <span role="alert" className="w-full text-danger">{state.error}</span>}
    </form>
  );
}
