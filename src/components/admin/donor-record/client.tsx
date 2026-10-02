"use client";

import { useActionState, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { Feedback } from "@/components/donor/forms";
import { cn } from "@/lib/utils";

type State = { ok?: boolean; error?: string; message?: string } | undefined;
type Action = (s: State, f: FormData) => Promise<State>;

/**
 * The Main tab's editable profile. The Save button sits in the action toolbar above the form (outside it, linked by
 * the form attribute) so the toolbar can also hold other small forms, like "Send email", without nesting forms.
 */
export function DonorMainForm({ action, formId, canEdit, toolbar, children }: {
  action: Action; formId: string; canEdit: boolean; toolbar: React.ReactNode; children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <>
      <div className="mt-0 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-b-lg border border-t-0 border-line bg-white px-4 py-3 shadow-sm">
        {canEdit && (
          <button type="submit" form={formId} disabled={pending}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-teal-800 px-6 font-bold text-white hover:bg-teal-800/90 disabled:opacity-60">
            <Check aria-hidden="true" size={18} />{pending ? "Saving…" : "Save"}
          </button>
        )}
        {toolbar}
      </div>
      <Feedback state={state} />
      <form id={formId} action={formAction}>{children}</form>
    </>
  );
}

/** A small one-click row action (e.g. "Make default", "Remove") with its result shown inline. */
export function InlineAction({ action, fields, label, tone = "link" }: {
  action: Action; fields: Record<string, string>; label: string; tone?: "link" | "danger";
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="inline">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" disabled={pending}
        className={cn("min-h-11 font-semibold hover:underline disabled:opacity-60", tone === "danger" ? "text-danger" : "text-teal-600")}>
        {pending ? "Working…" : label}
      </button>
      <span role="status" aria-live="polite" className="block text-sm">
        {state?.error && <span className="text-danger">{state.error}</span>}
        {state?.message && <span className="text-success">{state.message}</span>}
      </span>
    </form>
  );
}

/** A destructive row action that asks "Are you sure?" inline before running (e.g. deleting a saved card). */
export function ConfirmAction({ action, fields, label, confirmText }: {
  action: Action; fields: Record<string, string>; label: string; confirmText: string;
}) {
  const [asking, setAsking] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  if (state?.ok) return <span role="status" className="text-sm text-success">{state.message}</span>;
  return (
    <span className="inline-flex flex-col items-start">
      {!asking ? (
        <button type="button" onClick={() => setAsking(true)} className="inline-flex min-h-11 items-center gap-1 font-semibold text-danger hover:underline">
          <Trash2 aria-hidden="true" size={15} />{label}
        </button>
      ) : (
        <form action={formAction} className="flex flex-wrap items-center gap-x-3">
          {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <span className="text-sm">{confirmText}</span>
          <button type="submit" disabled={pending} className="min-h-11 font-semibold text-danger hover:underline disabled:opacity-60">{pending ? "Deleting…" : "Yes, delete"}</button>
          <button type="button" onClick={() => setAsking(false)} disabled={pending} className="min-h-11 font-semibold text-teal-600 hover:underline">Cancel</button>
        </form>
      )}
      {state?.error && <span role="alert" className="max-w-xs text-sm text-danger">{state.error}</span>}
    </span>
  );
}
