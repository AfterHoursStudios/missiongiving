"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { DonateFlow, type FlowConfig } from "./donate-flow";
import type { FormTemplateInput } from "@/lib/admin/form-template-schema";

/**
 * A "Donate now" button that opens the default donation form in a pop-up, so visitors give without leaving the page.
 * The form (and Stripe) only load once it's opened; each open starts a fresh form. After paying, Stripe takes the
 * donor to the usual confirmation page.
 */
export function DonateModalButton({ config, template, className, children }: {
  config: FlowConfig; template: FormTemplateInput | null; className?: string; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(0);
  const close = () => ref.current?.close();
  return (
    <>
      <button type="button" className={className} onClick={() => { setOpened((n) => n + 1); ref.current?.showModal(); }}>{children}</button>
      <dialog ref={ref} aria-label="Donate" onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(56rem,calc(100vw-1rem))] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-2xl bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/60">
        <div className="relative p-5 sm:p-8">
          <button type="button" onClick={close} className="absolute right-4 top-3 z-10 inline-flex min-h-11 items-center gap-1 font-semibold text-teal-600 hover:underline">
            Close<X aria-hidden="true" size={18} />
          </button>
          <h2 className="mb-6 mt-6 font-display text-3xl font-semibold">Give to Ultimate Mission</h2>
          {opened > 0 && <DonateFlow key={opened} config={config} template={template ?? undefined} />}
        </div>
      </dialog>
    </>
  );
}
