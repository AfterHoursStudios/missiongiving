"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

export function Field({ label, name, type = "text", autoComplete, required = true, hint }: {
  label: string; name: string; type?: string; autoComplete?: string; required?: boolean; hint?: string;
}) {
  const id = `f-${name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-semibold">{label}</label>
      <input
        id={id} name={name} type={type} autoComplete={autoComplete} required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="w-full min-h-12 rounded-md border border-ink-soft bg-white px-3 text-ink"
      />
      {hint && <p id={`${id}-hint`} className="text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit" disabled={pending}
      className={cn(
        "min-h-12 w-full rounded-md bg-brand-700 px-5 font-semibold text-white transition-colors",
        "hover:bg-brand-800 disabled:opacity-60 disabled:cursor-not-allowed",
      )}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

export function AuthForm({ action, submitLabel, children }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-5" noValidate={false}>
      {children}
      {/* Honeypot; hidden from people and assistive tech */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <label>Website<input tabIndex={-1} name="website" autoComplete="off" /></label>
      </div>
      <div role="status" aria-live="polite">
        {state?.error && <p className="rounded-md bg-danger-bg p-3 text-danger">{state.error}</p>}
        {state?.message && <p className="rounded-md bg-success-bg p-3 text-success">{state.message}</p>}
      </div>
      <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}
