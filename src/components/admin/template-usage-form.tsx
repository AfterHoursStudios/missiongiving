"use client";

import { useActionState, useState } from "react";
import { setTemplateUsage } from "@/lib/admin/template-actions";
import { AUTOMATIC_EMAILS, DONATION_EVENTS } from "@/lib/comms/automatic-emails";
import { Feedback } from "@/components/donor/forms";

/**
 * "Used for" on a message template: tick the automatic emails this template should be sent for. "All donations" ticks
 * the three receipt / thank-you emails at once. `others` names the template each email currently uses, if not this one.
 */
export function TemplateUsageForm({ templateKey, checked, others }: { templateKey: string; checked: string[]; others: Record<string, string> }) {
  const [state, action, pending] = useActionState(setTemplateUsage, undefined);
  const [on, setOn] = useState<Set<string>>(new Set(checked));
  const toggle = (e: string) => setOn((s) => { const n = new Set(s); if (n.has(e)) n.delete(e); else n.add(e); return n; });
  const allDonations = DONATION_EVENTS.every((e) => on.has(e));

  return (
    <form action={action}>
      <input type="hidden" name="key" value={templateKey} />
      <button type="button" onClick={() => setOn((s) => { const n = new Set(s); DONATION_EVENTS.forEach((e) => (allDonations ? n.delete(e) : n.add(e))); return n; })}
        className="min-h-11 rounded-md border-2 border-teal-800 px-4 font-semibold text-teal-800 hover:bg-paper-2">
        {allDonations ? "Untick all donations" : "Tick all donations"}
      </button>
      <fieldset className="mt-3">
        <legend className="sr-only">Automatic emails that use this template</legend>
        <div className="space-y-1">
          {AUTOMATIC_EMAILS.map((e) => (
            <label key={e.event} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line px-3 py-2 has-[:checked]:border-teal-800 has-[:checked]:bg-paper-2">
              <input type="checkbox" name="event" value={e.event} checked={on.has(e.event)} onChange={() => toggle(e.event)} className="mt-1 size-4" />
              <span>
                <span className="font-semibold">{e.label}</span>
                <span className="block text-sm text-ink-soft">{e.hint}</span>
                {others[e.event] && !on.has(e.event) && <span className="block text-sm text-ink-soft">Currently uses: {others[e.event]}</span>}
                {others[e.event] && on.has(e.event) && <span className="block text-sm text-warning">Will replace “{others[e.event]}” for this email</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" disabled={pending} className="mt-4 min-h-11 rounded-md bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800 disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
      <Feedback state={state} />
    </form>
  );
}
