"use client";

import { useActionState } from "react";
import { Pencil } from "lucide-react";
import { setFundraisingGoal } from "@/lib/reports/dashboard-actions";

/** "Set your goal" under the Dashboard's goal bar: an amount in dollars, saved for the current fiscal year. */
export function GoalForm({ currentDollars }: { currentDollars: string }) {
  const [state, action, pending] = useActionState(setFundraisingGoal, undefined);
  return (
    <details className="text-right">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-teal-600 hover:underline [&::-webkit-details-marker]:hidden">
        {currentDollars ? "Change your goal" : "Set your goal"}<Pencil aria-hidden="true" size={14} />
      </summary>
      <form action={action} className="mt-2 flex flex-wrap items-end justify-end gap-2">
        <div className="text-left"><label htmlFor="goal" className="block text-sm font-semibold">Goal for this fiscal year ($)</label>
          <input id="goal" name="goal" inputMode="decimal" defaultValue={currentDollars} placeholder="250000" className="mt-1 min-h-11 w-44 rounded-md border border-ink-soft bg-white px-3" /></div>
        <button disabled={pending} className="min-h-11 rounded-md bg-teal-800 px-4 font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Save goal"}</button>
        <p role="status" aria-live="polite" className="w-full text-sm">{state?.error ? <span className="text-danger">{state.error}</span> : state?.ok ? <span className="text-success">{state.message}</span> : null}</p>
      </form>
    </details>
  );
}
