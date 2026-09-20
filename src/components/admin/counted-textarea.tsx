"use client";

import { useState } from "react";

/** A textarea with a live character counter, so the limit is visible before it silently stops accepting text. */
export function CountedTextarea({ id, name, label, max, rows = 4, defaultValue = "", hint }: {
  id: string; name: string; label: string; max: number; rows?: number; defaultValue?: string; hint?: string;
}) {
  const [n, setN] = useState(defaultValue.length);
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">{label}</label>
      <textarea id={id} name={name} rows={rows} maxLength={max} defaultValue={defaultValue} aria-describedby={`${id}-count`}
        onChange={(e) => setN(e.target.value.length)} className="mt-1.5 w-full rounded-md border border-ink-soft bg-white px-3 py-2" />
      <p id={`${id}-count`} className="text-sm text-ink-soft">{hint ? `${hint} ` : ""}{n} of {max} characters</p>
    </div>
  );
}
