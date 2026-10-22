"use client";

import { useActionState, useRef } from "react";
import { Check } from "lucide-react";
import type { AdminState } from "@/lib/admin/donor-actions";
import { TEMPLATE_VARIABLES, TEMPLATE_VARIABLE_LABELS } from "@/lib/template-variables";
import { EmailEditor } from "./email-editor";

const input = "mt-1.5 min-h-11 w-full rounded-md border border-ink-soft/60 bg-white px-3";

export interface TemplateBuilderValues { key?: string; name: string; replyTo: string; subject: string; bodyHtml: string }

/**
 * The message template builder (laid out like DonorPerfect's): name, reply-to, the from address (read-only), subject with
 * merge fields, and the formatted message, with Save in the side panel. Used by both New template and Edit template.
 */
export function TemplateBuilder({ action, values, fromAddress, defaultReplyTo, submitLabel, meta }: {
  action: (state: AdminState, form: FormData) => Promise<AdminState>;
  values: TemplateBuilderValues; fromAddress: string; defaultReplyTo: string; submitLabel: string;
  /** Side-panel lines such as "Last saved …". */
  meta?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const subject = useRef<HTMLInputElement>(null);

  function insertIntoSubject(v: string) {
    const el = subject.current;
    if (!el || !v) return;
    const at = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? at, token = `{{${v}}}`;
    el.value = el.value.slice(0, at) + token + el.value.slice(end);
    el.focus();
    el.setSelectionRange(at + token.length, at + token.length);
  }

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      {values.key && <input type="hidden" name="key" value={values.key} />}
      <div className="space-y-5 rounded-xl border border-line bg-white p-4 shadow-sm sm:p-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div><label htmlFor="tb-name" className="block font-semibold">Template name <span aria-hidden="true" className="text-danger">*</span></label>
            <input id="tb-name" name="name" required maxLength={80} defaultValue={values.name} className={input} /></div>
        </div>
        <div className="sm:max-w-xl"><label htmlFor="tb-reply" className="block font-semibold">Reply-to email</label>
          <input id="tb-reply" name="reply_to" type="email" maxLength={200} defaultValue={values.replyTo} placeholder={defaultReplyTo || "name@example.org"} aria-describedby="tb-reply-h" className={input} />
          <p id="tb-reply-h" className="mt-1 text-sm text-ink-soft">When a donor replies, it goes here.{defaultReplyTo ? ` Leave blank to use ${defaultReplyTo}.` : ""}</p></div>
        <div className="sm:max-w-xl"><span className="block font-semibold">From address</span>
          <p className="mt-1.5 flex min-h-11 items-center rounded-md bg-paper-2 px-3 text-ink-soft">{fromAddress}</p></div>
        <div><label htmlFor="tb-subject" className="block font-semibold">Subject <span aria-hidden="true" className="text-danger">*</span></label>
          <div className="mt-1.5 flex flex-wrap gap-2 sm:flex-nowrap">
            <input ref={subject} id="tb-subject" name="subject" required maxLength={200} defaultValue={values.subject} className="min-h-11 w-full rounded-md border border-ink-soft/60 bg-white px-3" />
            <select aria-label="Insert merge field into the subject" value="" onChange={(e) => insertIntoSubject(e.target.value)}
              className="min-h-11 shrink-0 rounded-md border border-line bg-paper-2 px-2 text-sm font-semibold">
              <option value="">Insert merge field</option>
              {TEMPLATE_VARIABLES.map((v) => <option key={v} value={v}>{TEMPLATE_VARIABLE_LABELS[v]}</option>)}
            </select>
          </div></div>
        <div><span id="tb-body-label" className="block font-semibold">Message <span aria-hidden="true" className="text-danger">*</span></span>
          <div className="mt-1.5"><EmailEditor name="body" initialHtml={values.bodyHtml} labelledBy="tb-body-label" /></div>
          <p className="mt-1 text-sm text-ink-soft">Merge fields like {"{{donor_first_name}}"} are filled in for each donor when the email is sent. Click a picture, then use the align buttons to move it left, center or right; drag its corner to resize it.</p></div>
      </div>

      <aside className="h-fit space-y-4 rounded-xl bg-paper-2 p-4 lg:sticky lg:top-4">
        {meta && <div className="text-sm text-ink-soft">{meta}</div>}
        <button type="submit" disabled={pending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-teal-800 px-4 font-bold text-white hover:bg-teal-800/90 disabled:opacity-60">
          <Check aria-hidden="true" size={18} />{pending ? "Saving…" : submitLabel}
        </button>
        <div role="status" aria-live="polite">
          {state?.error && <p className="rounded-md bg-danger-bg p-3 text-danger">{state.error}</p>}
          {state?.ok && <p className="rounded-md bg-success-bg p-3 text-success">{state.message ?? "Saved."}</p>}
        </div>
      </aside>
    </form>
  );
}
