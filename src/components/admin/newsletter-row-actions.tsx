"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteNewsletterDraft } from "@/lib/comms/newsletter-actions";

/** "Delete draft" with an inline confirmation (no browser pop-up). */
export function DeleteNewsletterDraft({ id, after = "/admin/newsletters" }: { id: string; after?: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!confirming) {
    return <button type="button" onClick={() => setConfirming(true)} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-danger hover:underline"><Trash2 size={16} aria-hidden="true" />Delete draft</button>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      Delete this draft?
      <button type="button" disabled={pending} className="min-h-11 rounded-md bg-danger px-3 font-semibold text-white disabled:opacity-60"
        onClick={() => start(async () => { const r = await deleteNewsletterDraft(id); if (!r.ok) return setError(r.error); router.push(after); router.refresh(); })}>Delete</button>
      <button type="button" onClick={() => setConfirming(false)} className="min-h-11 px-2 font-semibold text-teal-600 hover:underline">Cancel</button>
      {error && <span role="alert" className="text-danger">{error}</span>}
    </span>
  );
}
