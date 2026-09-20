"use client";

import { useState } from "react";
import { SimpleForm, TextInput } from "@/components/donor/forms";
import type { AdminState } from "@/lib/admin/donor-actions";

interface D { id: string; first_name: string; last_name: string; email: string }

export function MergePair({ donors, action, groupId }: { donors: [D, D]; action: (s: AdminState, f: FormData) => Promise<AdminState>; groupId: string }) {
  const [primary, setPrimary] = useState(donors[0].id);
  const secondary = donors.find((d) => d.id !== primary)!;
  return (
    <SimpleForm action={action} submit="Merge records" tone="danger">
      <label htmlFor={`p-${groupId}`} className="block font-semibold">Keep this record</label>
      <select id={`p-${groupId}`} name="primary" value={primary} onChange={(e) => setPrimary(e.target.value)}
        className="min-h-11 w-full rounded-md border border-ink-soft bg-white px-2">
        {donors.map((d) => <option key={d.id} value={d.id}>{d.first_name} {d.last_name} ({d.email})</option>)}
      </select>
      <input type="hidden" name="secondary" value={secondary.id} />
      <p className="text-sm">Will be merged into it and marked merged: <strong>{secondary.first_name} {secondary.last_name}</strong> ({secondary.email}).</p>
      <TextInput label="Type MERGE to confirm" name="confirm" />
    </SimpleForm>
  );
}
