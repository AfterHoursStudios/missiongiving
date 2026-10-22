"use client";

import { useState } from "react";

const NEW = "__new__";

/**
 * The Designation dropdown on the Add gift forms, with "+ New designation…" at the end for a gift that fits none of
 * them: it shows a name box, and the designation is created (as a draft project, plus a to-do to finish it) when the
 * gift is saved. With `names` it writes hidden inputs for a plain form; `onChange` reports to a form with its own state.
 */
export function DesignationSelect({ projects, className, names, onChange }: {
  projects: { id: string; title: string }[]; className: string;
  names?: { projectId: string; newDesignation: string };
  /** `pickingNew` is true while "+ New designation…" is chosen, even before a name is typed. */
  onChange?: (v: { projectId: string; newDesignation: string; pickingNew: boolean }) => void;
}) {
  const [choice, setChoice] = useState("");
  const [name, setName] = useState("");
  const isNew = choice === NEW;
  const report = (c: string, n: string) => onChange?.({ projectId: c === NEW ? "" : c, newDesignation: c === NEW ? n : "", pickingNew: c === NEW });

  return (
    <div>
      <label htmlFor="designation" className="block font-semibold">Designation</label>
      <select id="designation" className={className} value={choice} onChange={(e) => { setChoice(e.target.value); report(e.target.value, name); }}>
        <option value="">General Fund</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        <option value={NEW}>+ New designation…</option>
      </select>
      {names && <>
        <input type="hidden" name={names.projectId} value={isNew ? "" : choice} />
        <input type="hidden" name={names.newDesignation} value={isNew ? name : ""} />
      </>}
      {isNew && (
        <div className="mt-3 rounded-md border border-line bg-paper-2 p-3">
          <label htmlFor="new-designation" className="block font-semibold">New designation name</label>
          <input id="new-designation" required maxLength={120} autoFocus value={name} aria-describedby="new-designation-h"
            onChange={(e) => { setName(e.target.value); report(NEW, e.target.value); }} className={className} />
          <p id="new-designation-h" className="mt-1 text-sm text-ink-soft">
            Created when the gift is saved, as a draft project that isn&apos;t shown on the website. You&apos;ll get a to-do to add its details.
          </p>
        </div>
      )}
    </div>
  );
}
