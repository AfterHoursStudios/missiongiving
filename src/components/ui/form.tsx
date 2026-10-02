"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

export function Field({ label, name, id, type = "text", autoComplete, required = true, hint, defaultValue, placeholder }: {
  label: string; name: string; id?: string; type?: string; autoComplete?: string; required?: boolean; hint?: string; defaultValue?: string; placeholder?: string;
}) {
  // Pass `id` when the same field name appears twice on one page (e.g. two email boxes).
  const fid = id ?? `f-${name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fid} className="block text-sm font-semibold">{label}</label>
      <input
        id={fid} name={name} type={type} autoComplete={autoComplete} required={required} defaultValue={defaultValue} placeholder={placeholder}
        aria-describedby={hint ? `${fid}-hint` : undefined}
        className={cn(
          "w-full min-h-12 rounded-xl border border-line bg-paper px-4 text-ink transition-colors placeholder:text-ink-soft/70",
          "hover:border-ink-soft/50 focus:border-teal-600 focus:bg-white",
        )}
      />
      {hint && <p id={`${fid}-hint`} className="text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

export function SubmitButton({ pending, variant = "primary", children }: {
  pending: boolean; variant?: "primary" | "outline"; children: React.ReactNode;
}) {
  return (
    <button
      type="submit" disabled={pending}
      className={cn(
        "min-h-12 w-full rounded-full px-6 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" ? "bg-ink text-white hover:bg-ink/85" : "border border-ink/30 bg-white text-ink hover:border-ink",
      )}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

export function AuthForm({ action, submitLabel, variant, children }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  submitLabel: string;
  variant?: "primary" | "outline";
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
      <div role="status" aria-live="polite" className="empty:hidden">
        {state?.error && <p className="rounded-xl bg-danger-bg px-4 py-3 text-sm text-danger">{state.error}</p>}
        {state?.message && <p className="rounded-xl bg-success-bg px-4 py-3 text-sm text-success">{state.message}</p>}
      </div>
      <SubmitButton pending={pending} variant={variant}>{submitLabel}</SubmitButton>
    </form>
  );
}
