"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { activeSuperAdminIds, isSuperAdmin } from "./roles";
import { canEditRolePermissions, canManageRole, wouldRemoveLastSuperAdmin } from "./staff-guards";
import type { AdminState } from "./donor-actions";

const uuid = z.string().uuid();

const superAdminIds = activeSuperAdminIds;

async function loadRole(roleId: string) {
  const { data } = await createSupabaseAdminClient().from("roles").select("id, key").eq("id", roleId).maybeSingle();
  return data;
}

export async function inviteStaff(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("staff.manage");
  const p = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email"), name: z.string().trim().min(1, "Enter a name").max(80), roleId: uuid })
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  if (!rateLimit(`invite:${user.id}`, 20, 60 * 60_000).ok) return { error: "Too many invitations. Try again later." };
  const role = await loadRole(p.data.roleId);
  if (!role) return { error: "Role not found." };
  if (!canManageRole(await isSuperAdmin(user.id), role.key)) return { error: "Only a Super Admin can grant the Super Admin role." };

  const db = createSupabaseAdminClient();
  // The invited person sets their own password from the emailed link; no password is ever created or shown here.
  const { data, error } = await db.auth.admin.inviteUserByEmail(p.data.email, { redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=/admin` });
  if (error || !data.user) return { error: "Could not send the invitation. The person may already have an account; ask them to sign in, then assign a role here." };
  await db.from("staff_profiles").upsert({ user_id: data.user.id, display_name: p.data.name, active: true });
  await db.from("staff_role_assignments").upsert({ user_id: data.user.id, role_id: role.id, assigned_by: user.id });
  await audit(user.id, "permissions.change", "staff", data.user.id, { op: "invite", role: role.key });
  revalidatePath("/admin/staff");
  return { ok: true, message: `Invitation sent to ${p.data.email}.` };
}

export async function assignRole(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("staff.manage");
  const p = z.object({ userId: uuid, roleId: uuid, op: z.enum(["add", "remove"]) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Invalid request." };
  const role = await loadRole(p.data.roleId);
  if (!role) return { error: "Role not found." };
  const actorIsSuper = await isSuperAdmin(user.id);
  if (!canManageRole(actorIsSuper, role.key)) return { error: "Only a Super Admin can change the Super Admin role." };
  const db = createSupabaseAdminClient();

  if (p.data.op === "remove") {
    if (role.key === "super_admin" && wouldRemoveLastSuperAdmin(await superAdminIds(), p.data.userId)) return { error: "You cannot remove the last active Super Admin." };
    await db.from("staff_role_assignments").delete().eq("user_id", p.data.userId).eq("role_id", role.id);
  } else {
    const { data: s } = await db.from("staff_profiles").select("user_id").eq("user_id", p.data.userId).maybeSingle();
    if (!s) return { error: "Staff member not found." };
    await db.from("staff_role_assignments").upsert({ user_id: p.data.userId, role_id: role.id, assigned_by: user.id });
  }
  await audit(user.id, "permissions.change", "staff", p.data.userId, { op: p.data.op, role: role.key });
  revalidatePath("/admin/staff");
  return { ok: true, message: p.data.op === "add" ? "Role added." : "Role removed." };
}

export async function setStaffActive(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("staff.manage");
  const p = z.object({ userId: uuid, active: z.enum(["true", "false"]) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: "Invalid request." };
  const active = p.data.active === "true";
  const supers = await superAdminIds();
  if (!active && wouldRemoveLastSuperAdmin(supers, p.data.userId)) return { error: "You cannot deactivate the last active Super Admin." };
  if (!active && supers.includes(p.data.userId) && !(await isSuperAdmin(user.id))) return { error: "Only a Super Admin can deactivate a Super Admin." };
  await createSupabaseAdminClient().from("staff_profiles").update({ active }).eq("user_id", p.data.userId);
  await audit(user.id, "permissions.change", "staff", p.data.userId, { op: active ? "activate" : "deactivate" });
  revalidatePath("/admin/staff");
  return { ok: true, message: active ? "Staff member activated." : "Staff member deactivated. They can no longer use the admin portal." };
}

/** Replaces the permission set for one role. Super Admin only; the Super Admin role is immutable. */
export async function saveRolePermissions(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("staff.manage");
  const roleId = uuid.safeParse(form.get("roleId"));
  if (!roleId.success) return { error: "Role not found." };
  const role = await loadRole(roleId.data);
  if (!role) return { error: "Role not found." };
  if (!canEditRolePermissions(await isSuperAdmin(user.id), role.key)) return { error: "Only a Super Admin can edit role permissions, and the Super Admin role cannot be changed." };
  const chosen = form.getAll("perm").map(String).filter((p): p is (typeof PERMISSIONS)[number] => (PERMISSIONS as readonly string[]).includes(p));
  const db = createSupabaseAdminClient();
  const { data: before } = await db.from("role_permissions").select("permission_key").eq("role_id", role.id);
  await db.from("role_permissions").delete().eq("role_id", role.id);
  if (chosen.length) await db.from("role_permissions").insert(chosen.map((permission_key) => ({ role_id: role.id, permission_key })));
  const prev = new Set((before ?? []).map((r) => r.permission_key));
  await audit(user.id, "permissions.change", "role", role.key, {
    added: chosen.filter((c) => !prev.has(c)), removed: [...prev].filter((c) => !chosen.includes(c as never)),
  });
  revalidatePath("/admin/staff/roles");
  return { ok: true, message: "Permissions saved. They apply on the person's next request." };
}

/**
 * "Change role" pop-up: sets a staff member's roles to exactly the ticked ones. Applies only the differences, with the
 * same rules as assignRole: only a Super Admin may grant or remove Super Admin, and the last active Super Admin stays.
 */
export async function setStaffRoles(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("staff.manage");
  const userId = uuid.safeParse(form.get("userId"));
  const wanted = z.array(uuid).safeParse(form.getAll("roleId"));
  if (!userId.success || !wanted.success) return { error: "Invalid request." };
  const db = createSupabaseAdminClient();
  const [{ data: s }, { data: roles }, { data: current }] = await Promise.all([
    db.from("staff_profiles").select("user_id").eq("user_id", userId.data).maybeSingle(),
    db.from("roles").select("id, key"),
    db.from("staff_role_assignments").select("role_id").eq("user_id", userId.data),
  ]);
  if (!s) return { error: "Staff member not found." };
  const keyOf = new Map((roles ?? []).map((r) => [r.id as string, r.key as string]));
  if (wanted.data.some((id) => !keyOf.has(id))) return { error: "Role not found." };
  const have = new Set((current ?? []).map((r) => r.role_id as string));
  const want = new Set(wanted.data);
  const adds = [...want].filter((id) => !have.has(id));
  const removes = [...have].filter((id) => !want.has(id));
  if (adds.length === 0 && removes.length === 0) return { ok: true, message: "No changes." };

  const actorIsSuper = await isSuperAdmin(user.id);
  if ([...adds, ...removes].some((id) => !canManageRole(actorIsSuper, keyOf.get(id)!))) return { error: "Only a Super Admin can change the Super Admin role." };
  if (removes.some((id) => keyOf.get(id) === "super_admin") && wouldRemoveLastSuperAdmin(await superAdminIds(), userId.data)) {
    return { error: "You cannot remove the last active Super Admin." };
  }

  if (removes.length) await db.from("staff_role_assignments").delete().eq("user_id", userId.data).in("role_id", removes);
  if (adds.length) await db.from("staff_role_assignments").upsert(adds.map((role_id) => ({ user_id: userId.data, role_id, assigned_by: user.id })));
  for (const id of adds) await audit(user.id, "permissions.change", "staff", userId.data, { op: "add", role: keyOf.get(id) });
  for (const id of removes) await audit(user.id, "permissions.change", "staff", userId.data, { op: "remove", role: keyOf.get(id) });
  revalidatePath("/admin/staff");
  return { ok: true, message: "Roles updated." };
}
