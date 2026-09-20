"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/donor/actions";
import { cn } from "@/lib/utils";

type Action = (s: ActionState, f: FormData) => Promise<ActionState>;

export function Feedback({ state }: { state: ActionState }) {
  return (
    <div role="status" aria-live="polite">
      {state?.error && <p className="mt-3 rounded-md bg-danger-bg p-3 text-danger">{state.error}</p>}
      {state?.message && <p className="mt-3 rounded-md bg-success-bg p-3 text-success">{state.message}</p>}
    </div>
  );
}

export function Button({ pending, children, tone = "primary" }: { pending: boolean; children: React.ReactNode; tone?: "primary" | "danger" }) {
  return (
    <button type="submit" disabled={pending}
      className={cn("min-h-11 rounded-md px-5 font-semibold text-white disabled:opacity-60",
        tone === "danger" ? "bg-danger hover:bg-danger/90" : "bg-brand-700 hover:bg-brand-800")}>
      {pending ? "Saving…" : children}
    </button>
  );
}

export function CancelRecurringForm({ id, action }: { id: string; action: Action }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  if (state?.ok) return <Feedback state={state} />;
  return (
    <details className="mt-3">
      <summary className="inline-block min-h-11 cursor-pointer py-2 font-semibold text-danger underline">Cancel this recurring gift</summary>
      <form action={formAction} className="mt-2 rounded-md border border-danger p-4">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="confirm" value="yes" />
        <p className="font-semibold">Cancel future gifts?</p>
        <p className="mt-1 text-sm text-ink-soft">No further charges will be made. Your past gifts, receipts and statements stay in your account.</p>
        <div className="mt-3"><Button pending={pending} tone="danger">Yes, cancel future gifts</Button></div>
        <Feedback state={state} />
      </form>
    </details>
  );
}

export function ChangeAmountForm({ id, current, action }: { id: string; current: number; action: Action }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const fid = `amt-${id}`;
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <div>
        <label htmlFor={fid} className="block text-sm font-semibold">New amount (USD)</label>
        <input id={fid} name="amount" inputMode="decimal" defaultValue={(current / 100).toFixed(2)} required
          className="min-h-11 w-32 rounded-md border border-ink-soft bg-white px-3" />
      </div>
      <Button pending={pending}>Update amount</Button>
      <div className="basis-full"><Feedback state={state} /></div>
    </form>
  );
}

export function SimpleForm({ action, submit, children, tone }: { action: Action; submit: string; children: React.ReactNode; tone?: "primary" | "danger" }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      {children}
      <Button pending={pending} tone={tone}>{submit}</Button>
      <Feedback state={state} />
    </form>
  );
}

export function TextInput({ label, name, defaultValue, type = "text", autoComplete, required, hint }: {
  label: string; name: string; defaultValue?: string | null; type?: string; autoComplete?: string; required?: boolean; hint?: string;
}) {
  const id = `p-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">{label}</label>
      <input id={id} name={name} type={type} defaultValue={defaultValue ?? ""} autoComplete={autoComplete} required={required}
        aria-describedby={hint ? `${id}-h` : undefined}
        className="mt-1.5 min-h-12 w-full rounded-md border border-ink-soft bg-white px-3" />
      {hint && <p id={`${id}-h`} className="text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

export function CheckInput({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 size-5" />
      <span>{label}</span>
    </label>
  );
}
