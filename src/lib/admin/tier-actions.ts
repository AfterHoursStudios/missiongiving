"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { tierSchema, tierToRow } from "./tier-schema";
import type { AdminState } from "./donor-actions";

const uuid = z.string().uuid();

export async function saveTier(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("tiers.manage");
  const parsed = tierSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const row = tierToRow(parsed.data);
  const db = createSupabaseAdminClient();
  const id = form.get("id");

  if (row.project_id) {
    const { data: p } = await db.from("projects").select("id").eq("id", row.project_id).maybeSingle();
    if (!p) return { error: "That project does not exist." };
  }

  if (typeof id === "string" && id) {
    if (!uuid.safeParse(id).success) return { error: "Tier not found." };
    const { error } = await db.from("donation_tiers").update(row).eq("id", id);
    if (error) return { error: "Could not save the tier." };
    await audit(user.id, "tier.change", "donation_tier", id, { op: "update", amount_cents: row.amount_cents, status: row.status });
    revalidatePath("/admin/tiers");
    return { ok: true, message: "Tier saved." };
  }
  const { data, error } = await db.from("donation_tiers").insert(row).select("id").single();
  if (error || !data) return { error: "Could not create the tier." };
  await audit(user.id, "tier.change", "donation_tier", data.id, { op: "create", amount_cents: row.amount_cents });
  revalidatePath("/admin/tiers");
  redirect("/admin/tiers");
}

/** Activate, deactivate or archive. Tiers are never deleted because past donations reference them. */
export async function setTierStatus(form: FormData) {
  const { user } = await requirePermission("tiers.manage");
  const p = z.object({ id: uuid, status: z.enum(["active", "inactive", "archived"]) }).safeParse({ id: form.get("id"), status: form.get("status") });
  if (!p.success) return;
  await createSupabaseAdminClient().from("donation_tiers").update({ status: p.data.status }).eq("id", p.data.id);
  await audit(user.id, "tier.change", "donation_tier", p.data.id, { op: "status", status: p.data.status });
  revalidatePath("/admin/tiers");
}

export async function moveTier(form: FormData) {
  const { user } = await requirePermission("tiers.manage");
  const p = z.object({ id: uuid, dir: z.enum(["up", "down"]) }).safeParse({ id: form.get("id"), dir: form.get("dir") });
  if (!p.success) return;
  const db = createSupabaseAdminClient();
  const { data } = await db.from("donation_tiers").select("id").neq("status", "archived").order("display_order").order("amount_cents");
  const ids = (data ?? []).map((t) => t.id);
  const i = ids.indexOf(p.data.id);
  const j = p.data.dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await Promise.all(ids.map((id, n) => db.from("donation_tiers").update({ display_order: n + 1 }).eq("id", id)));
  await audit(user.id, "tier.change", "donation_tier", p.data.id, { op: "reorder", dir: p.data.dir });
  revalidatePath("/admin/tiers");
}
