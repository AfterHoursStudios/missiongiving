"use client";

import { useRef, useState } from "react";
import { MailPlus, X } from "lucide-react";
import type { ThankYouChoice } from "@/lib/admin/thank-you-templates";

const field = "mt-1.5 min-h-11 w-full rounded-md border border-ink-soft/60 bg-white px-3";
const PREVIEW_STYLE = "<style>body{font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1f2933;margin:16px;}a{color:#0f766e;}img{max-width:100%;height:auto;}</style>";

/**
 * "Add a thank-you message" at the bottom of the Add gift forms: a pop-up with a dropdown of message templates and a
 * preview of the chosen one. The pick replaces the gift's automatic thank-you email. With `name` it also writes a hidden
 * input for a plain form; `onChange` reports the pick to a form that keeps its own state.
 */
export function ThankYouPicker({ templates, name, onChange }: { templates: ThankYouChoice[]; name?: string; onChange?: (key: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState("");
  const [draft, setDraft] = useState("");
  const picked = templates.find((t) => t.key === chosen);
  const preview = templates.find((t) => t.key === draft);
  const choose = (key: string) => { setChosen(key); onChange?.(key); };
  const open = () => { setDraft(chosen || templates[0]?.key || ""); ref.current?.showModal(); };
  const close = () => ref.current?.close();

  return (
    <div className="rounded-md border border-line p-3">
      {name && <input type="hidden" name={name} value={chosen} />}
      {picked ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="flex-1"><span className="block text-sm text-ink-soft">Thank-you message</span><span className="font-semibold">{picked.name}</span></p>
          <button type="button" onClick={open} className="min-h-11 font-semibold text-teal-600 hover:underline">Change</button>
          <button type="button" onClick={() => choose("")} className="min-h-11 font-semibold text-danger hover:underline">Remove</button>
        </div>
      ) : (
        <button type="button" onClick={open} className="inline-flex min-h-11 items-center gap-2 font-semibold text-teal-600 hover:underline">
          <MailPlus aria-hidden="true" size={18} />Add a thank-you message
        </button>
      )}
      <p className="mt-1 text-sm text-ink-soft">
        {picked ? "Emailed to the donor, with their receipt, instead of the automatic thank-you once the gift is recorded." : "Optional. Without one, the automatic thank-you email is used."}
      </p>

      <dialog ref={ref} aria-labelledby="thank-you-title" onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(40rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50">
        <div className="relative p-5 sm:p-6">
          <button type="button" onClick={close} className="absolute right-4 top-3 inline-flex min-h-11 items-center gap-1 font-semibold text-teal-600 hover:underline">
            Close<X aria-hidden="true" size={18} />
          </button>
          <h2 id="thank-you-title" className="mt-6 text-2xl font-bold">Choose a thank-you message</h2>
          <p className="mt-1 text-ink-soft">The preview uses sample gift details; the donor&apos;s email shows this gift&apos;s real amount, date and designation.</p>
          {templates.length === 0 ? (
            <p className="mt-5 text-ink-soft">No message templates yet. Create one under Mailings/Forms → Messages.</p>
          ) : (<>
            <label htmlFor="thank-you-template" className="mt-5 block font-semibold">Message template</label>
            <select id="thank-you-template" value={draft} onChange={(e) => setDraft(e.target.value)} className={field}>
              {templates.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
            {preview && (
              <div className="mt-4 overflow-hidden rounded-md border border-line">
                <p className="border-b border-line bg-paper-2 px-3 py-2 text-sm"><span className="text-ink-soft">Subject: </span><span className="font-semibold">{preview.subject}</span></p>
                {/* sandbox="" : the template HTML is sanitized already, and the preview can't run scripts or navigate this page. */}
                <iframe title={`Preview of ${preview.name}`} sandbox="" srcDoc={`<!doctype html><meta charset="utf-8">${PREVIEW_STYLE}${preview.html}`} className="h-80 w-full bg-white" />
              </div>
            )}
          </>)}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" disabled={!preview} onClick={() => { choose(draft); close(); }}
              className="min-h-11 rounded-full bg-teal-800 px-6 font-bold text-white hover:bg-teal-800/90 disabled:opacity-60">Use this message</button>
            <button type="button" onClick={close} className="min-h-11 rounded-full border-2 border-teal-800 px-6 font-bold text-teal-800 hover:bg-paper-2">Cancel</button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
