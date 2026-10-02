"use client";

import { useActionState, useRef, useState } from "react";
import { Mail, X } from "lucide-react";
import { sendDonorMessage } from "@/lib/admin/template-actions";

const field = "min-h-11 w-full rounded-md border border-ink-soft/60 bg-white px-3";

/**
 * "Send Email" in the donor record's toolbar: a pop-up to send one saved message template to this donor. Closes once
 * it's sent and shows the result next to the button; errors (e.g. do-not-contact, email not configured) stay in the pop-up.
 */
export function SendEmailButton({ donorId, templates, className }: { donorId: string; templates: { key: string; name: string }[]; className: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(0); // a fresh form on each open
  const [sent, setSent] = useState<string | null>(null);
  const close = () => ref.current?.close();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3">
      <button type="button" className={className} onClick={() => { setSent(null); setKey((k) => k + 1); ref.current?.showModal(); }}>
        <Mail aria-hidden="true" size={16} />Send Email
      </button>
      <span role="status" aria-live="polite" className="text-sm text-success">{sent}</span>
      <dialog ref={ref} aria-labelledby="send-email-title" onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50">
        <div className="relative p-5 sm:p-6">
          <button type="button" onClick={close} className="absolute right-4 top-3 inline-flex min-h-11 items-center gap-1 font-semibold text-teal-600 hover:underline">
            Close<X aria-hidden="true" size={18} />
          </button>
          <EmailForm key={key} donorId={donorId} templates={templates} onCancel={close} onSent={(msg) => { setSent(msg); close(); }} />
        </div>
      </dialog>
    </span>
  );
}

function EmailForm({ donorId, templates, onSent, onCancel }: {
  donorId: string; templates: { key: string; name: string }[]; onSent: (message: string) => void; onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(async (s: Awaited<ReturnType<typeof sendDonorMessage>>, f: FormData) => {
    const r = await sendDonorMessage(s, f);
    if (r?.ok) onSent(r.message ?? "Email sent.");
    return r;
  }, undefined);
  return (
    <form action={action} className="mt-6">
      <h2 id="send-email-title" className="text-2xl font-bold">Send email</h2>
      <p className="mt-1 text-ink-soft">Sends one saved message template to this donor only.</p>
      <input type="hidden" name="donorId" value={donorId} />
      <label htmlFor="send-template" className="mt-5 block font-semibold">Message template</label>
      {templates.length === 0
        ? <p className="mt-1 text-ink-soft">No templates yet. Create one under Mailings/Forms → Messages.</p>
        : (
          <select id="send-template" name="templateKey" required defaultValue="" className={field}>
            <option value="" disabled>Choose a message…</option>
            {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
        )}
      <div role="status" aria-live="polite">{state?.error && <p className="mt-3 rounded-md bg-danger-bg p-3 text-danger">{state.error}</p>}</div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" disabled={pending || templates.length === 0} className="min-h-11 rounded-full bg-teal-800 px-6 font-bold text-white hover:bg-teal-800/90 disabled:opacity-60">{pending ? "Sending…" : "Send"}</button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full border-2 border-teal-800 px-6 font-bold text-teal-800 hover:bg-paper-2">Close</button>
      </div>
    </form>
  );
}
