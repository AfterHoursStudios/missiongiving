"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { setSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { dollarsToCents } from "@/lib/money";
import type { AdminState } from "@/lib/admin/donor-actions";
import { GOAL_SETTING } from "./dashboard";

/** "Set your goal" on the Dashboard: the fundraising goal for the current fiscal year. Blank clears it. */
export async function setFundraisingGoal(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("settings.manage");
  const raw = String(form.get("goal") ?? "").replace(/[$,\s]/g, "");
  let cents: number | null = null;
  if (raw) {
    try { cents = dollarsToCents(raw); } catch { return { error: "Enter the goal as an amount, like 250000." }; }
    if (cents <= 0 || cents > 100_000_000_000) return { error: "Enter a goal greater than $0." };
  }
  await setSetting(GOAL_SETTING, cents, user.id);
  await audit(user.id, "settings.change", "setting", GOAL_SETTING, { cents });
  revalidatePath("/admin/reports/dashboard");
  return { ok: true, message: cents ? "Goal saved." : "Goal cleared." };
}
