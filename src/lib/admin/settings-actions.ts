"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { getAllSettings, setSetting } from "@/lib/settings";
import { settingsSchema, settingsToEntries } from "./settings-schema";
import type { AdminState } from "./donor-actions";

export async function saveSettings(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("settings.manage");
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const entries = settingsToEntries(parsed.data);
  const before = await getAllSettings();
  const changed = Object.keys(entries).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(entries[k]));
  for (const k of changed) await setSetting(k, entries[k], user.id);
  // Key names only: values (EIN, addresses) are not copied into the audit trail.
  if (changed.length) await audit(user.id, "settings.change", "organization_settings", undefined, { keys: changed });
  revalidatePath("/admin/settings");
  return { ok: true, message: changed.length ? `Saved ${changed.length} change${changed.length === 1 ? "" : "s"}.` : "No changes." };
}
