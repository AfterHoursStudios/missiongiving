"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PlusCircle, X } from "lucide-react";
import { logContact } from "@/lib/admin/donor-actions";

const field = "min-h-11 w-full rounded-md border border-ink-soft/60 bg-white px-3";

/**
 * "+ Add contact" on a donor's Contacts tab: a pop-up to record a contact made outside the system (a thank-you call,
 * a mailed letter). Closes as soon as it's saved; the Contact List refreshes with the new entry.
 */
export function AddContactButton({ donorId, className }: { donorId: string; className: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(0); // a fresh, empty form on each open
  const [saved, setSaved] = useState(false);
  const close = () => ref.current?.close();
  // Arriving from the Main tab's "Log a Contact" link (…?tab=contacts#log-contact) opens the pop-up straight away.
  useEffect(() => { if (window.location.hash === "#log-contact") ref.current?.showModal(); }, []);
  return (
    <>
      <button id="log-contact" type="button" className={className} onClick={() => { setSaved(false); setKey((k) => k + 1); ref.current?.showModal(); }}>
        <PlusCircle aria-hidden="true" size={18} />Add contact
      </button>
      <span role="status" aria-live="polite" className="sr-only">{saved ? "Contact saved." : ""}</span>
      <dialog ref={ref} aria-labelledby="add-contact-title" onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(30rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50">
        <div className="relative p-5 sm:p-6">
          <button type="button" onClick={close} className="absolute right-4 top-3 inline-flex min-h-11 items-center gap-1 font-semibold text-teal-600 hover:underline">
            Close<X aria-hidden="true" size={18} />
          </button>
          <ContactForm key={key} donorId={donorId} onCancel={close} onSaved={() => { setSaved(true); close(); }} />
        </div>
      </dialog>
    </>
  );
}

function ContactForm({ donorId, onSaved, onCancel }: { donorId: string; onSaved: () => void; onCancel: () => void }) {
  const [state, action, pending] = useActionState(async (s: Awaited<ReturnType<typeof logContact>>, f: FormData) => {
    const r = await logContact(s, f);
    if (r?.ok) onSaved();
    return r;
  }, undefined);
  return (
    <form action={action} className="mt-6">
      <h2 id="add-contact-title" className="text-2xl font-bold">Add contact</h2>
      <p className="mt-1 text-ink-soft">Record a contact made outside the system, like a thank-you call or a mailed letter.</p>
      <input type="hidden" name="id" value={donorId} />
      <label htmlFor="contact-channel" className="mt-5 block font-semibold">How</label>
      <select id="contact-channel" name="channel" defaultValue="phone" className={field}>
        <option value="phone">Phone call</option><option value="mail">Letter mailed</option><option value="email">Email (sent outside the system)</option>
        <option value="in_person">Visit / meeting</option><option value="other">Other</option>
      </select>
      <label htmlFor="contact-subject" className="mt-4 block font-semibold">What was it?</label>
      <input id="contact-subject" name="subject" required maxLength={200} aria-describedby="contact-subject-hint" className={field} />
      <p id="contact-subject-hint" className="mt-1 text-sm text-ink-soft">e.g. Thank-you call for year-end gift</p>
      <label htmlFor="contact-detail" className="mt-4 block font-semibold">Notes <span className="font-normal text-ink-soft">(optional)</span></label>
      <textarea id="contact-detail" name="detail" rows={3} maxLength={2000} className="w-full rounded-md border border-ink-soft/60 bg-white px-3 py-2" />
      <div role="status" aria-live="polite">{state?.error && <p className="mt-3 rounded-md bg-danger-bg p-3 text-danger">{state.error}</p>}</div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-teal-800 px-6 font-bold text-white hover:bg-teal-800/90 disabled:opacity-60">{pending ? "Saving…" : "Save and close"}</button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full border-2 border-teal-800 px-6 font-bold text-teal-800 hover:bg-paper-2">Close</button>
      </div>
    </form>
  );
}
