"use client";

import { useRef, useState } from "react";
import { Code, X } from "lucide-react";

/** The HTML another website pastes to show this donation form, with a script that fits the frame to the form's height. */
export function embedSnippet(origin: string, formId: string, formName: string) {
  const id = `mg-donate-${formId.slice(0, 8)}`;
  return `<!-- Ultimate Mission donation form: ${formName.replace(/--/g, "-")} -->
<iframe id="${id}" src="${origin}/embed/donate?form=${formId}" title="Donate to Ultimate Mission"
  style="width:100%;max-width:760px;height:1200px;border:0;" allow="payment" loading="lazy"></iframe>
<script>
  window.addEventListener("message", function (e) {
    if (e.origin !== "${origin}" || !e.data || e.data.type !== "mission-giving:height") return;
    document.getElementById("${id}").style.height = e.data.height + "px";
  });
</script>`;
}

/** "Embed code" button for one donation form: shows the HTML to paste into another website, with a Copy button. */
export function EmbedCodeButton({ formId, formName, origin }: { formId: string; formName: string; origin: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const code = embedSnippet(origin, formId, formName);
  const close = () => ref.current?.close();
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* select the text manually */ }
  };
  return (
    <>
      <button type="button" onClick={() => { setCopied(false); ref.current?.showModal(); }}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md border-2 border-teal-800 px-4 font-semibold text-teal-800 hover:bg-paper-2">
        <Code aria-hidden="true" size={16} />Embed code
      </button>
      <dialog ref={ref} aria-labelledby={`embed-title-${formId}`} onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(44rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50">
        <div className="relative p-5 sm:p-6">
          <button type="button" onClick={close} className="absolute right-4 top-3 inline-flex min-h-11 items-center gap-1 font-semibold text-teal-600 hover:underline">
            Close<X aria-hidden="true" size={18} />
          </button>
          <h2 id={`embed-title-${formId}`} className="mt-6 text-2xl font-bold">Embed “{formName}” on another website</h2>
          <p className="mt-2 text-ink-soft">Copy this HTML and paste it into the other website where the form should appear (in WordPress, Squarespace or Wix, use a &ldquo;Custom HTML&rdquo; or &ldquo;Embed code&rdquo; block). Gifts made there are recorded here like any other.</p>
          <label htmlFor={`embed-code-${formId}`} className="mt-4 block font-semibold">Embed code</label>
          <textarea id={`embed-code-${formId}`} readOnly rows={11} value={code} onFocus={(e) => e.currentTarget.select()}
            className="mt-1.5 w-full rounded-md border border-ink-soft/60 bg-paper-2 p-3 font-mono text-sm" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={copy} className="min-h-11 rounded-full bg-teal-800 px-6 font-bold text-white hover:bg-teal-800/90">{copied ? "Copied!" : "Copy code"}</button>
            <a href={`${origin}/embed/donate?form=${formId}`} target="_blank" rel="noopener" className="font-semibold text-teal-600 hover:underline">Preview the embedded form</a>
          </div>
          <span role="status" aria-live="polite" className="sr-only">{copied ? "Embed code copied" : ""}</span>
          <ul className="mt-5 list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>The form is the same as on this site: one-time gifts need no account; monthly and yearly gifts ask the donor to sign in.</li>
            <li>The other website must use https (a padlock in the address bar) for card payments to work.</li>
            <li>Change the form here any time; embedded copies update automatically. Archiving the form shows the default form instead.</li>
          </ul>
        </div>
      </dialog>
    </>
  );
}
