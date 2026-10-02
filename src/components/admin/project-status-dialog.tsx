"use client";

import { useActionState, useRef, useState } from "react";
import { X } from "lucide-react";
import { setProjectStatus } from "@/lib/admin/project-actions";
import { PROJECT_STATUSES, PROJECT_STATUS_HELP } from "@/lib/admin/project-schema";

const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** "Change status" on the Projects list: a pop-up of the statuses (current one selected) that saves and closes. */
export function ProjectStatusButton({ projectId, title, status }: { projectId: string; title: string; status: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const close = () => ref.current?.close();
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" onClick={() => { setDone(null); setKey((k) => k + 1); ref.current?.showModal(); }}
        className="min-h-11 font-semibold text-teal-600 hover:underline">Change status</button>
      <span role="status" aria-live="polite" className="max-w-56 text-sm text-success">{done}</span>
      <dialog ref={ref} aria-labelledby={`ps-${projectId}`} onClick={(e) => { if (e.target === ref.current) close(); }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/50">
        <div className="relative p-5 sm:p-6">
          <button type="button" onClick={close} className="absolute right-4 top-3 inline-flex min-h-11 items-center gap-1 font-semibold text-teal-600 hover:underline">
            Close<X aria-hidden="true" size={18} />
          </button>
          <StatusForm key={key} projectId={projectId} title={title} status={status} onCancel={close} onDone={(m) => { setDone(m); close(); }} />
        </div>
      </dialog>
    </span>
  );
}

function StatusForm({ projectId, title, status, onDone, onCancel }: { projectId: string; title: string; status: string; onDone: (m: string) => void; onCancel: () => void }) {
  const [state, action, pending] = useActionState(async (s: Awaited<ReturnType<typeof setProjectStatus>>, f: FormData) => {
    const r = await setProjectStatus(s, f);
    if (r?.ok) onDone(r.message ?? "Status changed.");
    return r;
  }, undefined);
  return (
    <form action={action} className="mt-6">
      <h2 id={`ps-${projectId}`} className="text-2xl font-bold">Change status</h2>
      <p className="mt-1 text-ink-soft">{title}</p>
      <input type="hidden" name="id" value={projectId} />
      <fieldset className="mt-4"><legend className="sr-only">Status</legend>
        <div className="space-y-1">
          {PROJECT_STATUSES.map((s) => (
            <label key={s} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line px-3 py-2 has-[:checked]:border-teal-800 has-[:checked]:bg-paper-2">
              <input type="radio" name="status" value={s} defaultChecked={s === status} className="mt-1 size-4" />
              <span><span className="font-semibold">{label(s)}</span><span className="block text-sm text-ink-soft">{PROJECT_STATUS_HELP[s]}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div role="status" aria-live="polite">{state?.error && <p className="mt-3 rounded-md bg-danger-bg p-3 text-danger">{state.error}</p>}</div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="min-h-11 rounded-full bg-teal-800 px-6 font-bold text-white hover:bg-teal-800/90 disabled:opacity-60">{pending ? "Saving…" : "Save and close"}</button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-full border-2 border-teal-800 px-6 font-bold text-teal-800 hover:bg-paper-2">Close</button>
      </div>
    </form>
  );
}
