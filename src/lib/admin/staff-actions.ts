"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { publicEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { getOrgSettings } from "@/lib/settings";
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
  // A new person gets an account with no password; someone who already has one (a donor, say) keeps it.
  const { data: existing } = await db.from("profiles").select("id").eq("email", p.data.email).maybeSingle();
  const link = await inviteLink(p.data.email, existing ? "magiclink" : "invite");
  if ("error" in link) return { error: link.error };
  const userId = existing?.id ?? link.userId;
  await db.from("staff_profiles").upsert({ user_id: userId, display_name: p.data.name, active: true });
  await db.from("staff_role_assignments").upsert({ user_id: userId, role_id: role.id, assigned_by: user.id });
  const sent = await sendInviteEmail(p.data.email, p.data.name, link.url);
  await audit(user.id, "permissions.change", "staff", userId, { op: "invite", role: role.key, emailed: sent.ok });
  revalidatePath("/admin/staff");
  return sent.ok ? { ok: true, message: `Invitation emailed to ${p.data.email}.` } : { error: `${p.data.name} was added, but the email didn't go out: ${sent.error} Use Resend invite once that's fixed.` };
}

/**
 * A sign-in link Mission Giving emails itself (through Resend), instead of Supabase's built-in mailer, which sends only a
 * few messages an hour. The link opens /auth/confirm, which signs the person in and takes them to Set password.
 */
async function inviteLink(email: string, type: "invite" | "magiclink"): Promise<{ url: string; userId: string } | { error: string }> {
  const { data, error } = await createSupabaseAdminClient().auth.admin.generateLink({ type, email });
  const hash = data?.properties?.hashed_token;
  if (error || !hash || !data.user) return { error: "Could not create the invitation link. Check the email address and try again." };
  const params = new URLSearchParams({ token_hash: hash, type, next: "/set-password" });
  return { url: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/confirm?${params}`, userId: data.user.id };
}

async function sendInviteEmail(email: string, name: string, url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await getOrgSettings();
  const first = name.split(/\s+/)[0] || name;
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#14262b;max-width:560px;">`
    + `<p>Hi ${esc(first)},</p><p>You've been invited to the ${esc(s.brand_name)} staff portal. Select the button to set your password and sign in.</p>`
    + `<p style="margin:28px 0;"><a href="${esc(url)}" style="display:inline-block;padding:12px 24px;background:#024352;color:#ffffff;font-weight:700;text-decoration:none;border-radius:6px;">Set your password</a></p>`
    + `<p style="font-size:14px;color:#46595f;">The link works once and expires soon. If it has expired, ask for a new invitation. If you weren't expecting this, you can ignore it.</p></div>`;
  const text = `Hi ${first},\n\nYou've been invited to the ${s.brand_name} staff portal. Open this link to set your password and sign in:\n\n${url}\n\nThe link works once and expires soon. If it has expired, ask for a new invitation.`;
  try {
    const r = await sendEmail({ to: email, subject: `Your invitation to ${s.brand_name}`, html, text, fromName: s.email_sender_name, replyTo: s.email_reply_to || undefined, tags: [{ name: "kind", value: "staff_invite" }] });
    return r.skipped ? { ok: false, error: "Email isn't set up yet (RESEND_API_KEY and EMAIL_FROM_ADDRESS)." } : { ok: true };
  } catch {
    return { ok: false, error: "The email service rejected the message." };
  }
}

/** Emails a staff member a fresh sign-in link (for an invitation that expired or never arrived). */
export async function resendStaffInvite(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("staff.manage");
  const userId = uuid.safeParse(form.get("userId"));
  if (!userId.success) return { error: "Staff member not found." };
  if (!rateLimit(`invite:${user.id}`, 20, 60 * 60_000).ok) return { error: "Too many invitations. Try again later." };
  const db = createSupabaseAdminClient();
  const [{ data: staff }, { data: profile }] = await Promise.all([
    db.from("staff_profiles").select("display_name, active").eq("user_id", userId.data).maybeSingle(),
    db.from("profiles").select("email").eq("id", userId.data).maybeSingle(),
  ]);
  if (!staff || !profile?.email) return { error: "Staff member not found." };
  if (!staff.active) return { error: "Activate this staff member before resending their invitation." };
  const link = await inviteLink(profile.email, "magiclink");
  if ("error" in link) return { error: link.error };
  const sent = await sendInviteEmail(profile.email, staff.display_name, link.url);
  await audit(user.id, "permissions.change", "staff", userId.data, { op: "resend_invite", emailed: sent.ok });
  return sent.ok ? { ok: true, message: `New invitation emailed to ${profile.email}.` } : { error: sent.error };
}

/**
 * Removes a staff member: their roles and staff record, and their sign-in, unless it's also a donor's account (then only
 * staff access goes). If other records still point to the account (history it created), the sign-in is permanently
 * blocked instead of deleted, so that history stays intact. Same guards as Deactivate, and you can't delete yourself.
 */
export async function deleteStaff(_: AdminState, form: FormData): Promise<AdminState> {
  const { user } = await requirePermission("staff.manage");
  const userId = uuid.safeParse(form.get("userId"));
  if (!userId.success) return { error: "Staff member not found." };
  if (userId.data === user.id) return { error: "You can't delete yourself. Ask another administrator." };
  const supers = await superAdminIds();
  if (wouldRemoveLastSuperAdmin(supers, userId.data)) return { error: "You cannot delete the last active Super Admin." };
  if (supers.includes(userId.data) && !(await isSuperAdmin(user.id))) return { error: "Only a Super Admin can delete a Super Admin." };

  const db = createSupabaseAdminClient();
  const { data: staff } = await db.from("staff_profiles").select("display_name").eq("user_id", userId.data).maybeSingle();
  if (!staff) return { error: "Staff member not found." };
  const { data: donor } = await db.from("donor_profiles").select("id").eq("user_id", userId.data).maybeSingle();

  await db.from("staff_role_assignments").delete().eq("user_id", userId.data);
  const { error } = await db.from("staff_profiles").delete().eq("user_id", userId.data);
  if (error) return { error: "Could not remove this staff member." };

  let login: "kept_donor" | "deleted" | "blocked" = "kept_donor";
  if (!donor) {
    const del = await db.auth.admin.deleteUser(userId.data);
    if (del.error) {
      await db.auth.admin.updateUserById(userId.data, { ban_duration: "876000h" });
      login = "blocked";
    } else login = "deleted";
  }
  await audit(user.id, "permissions.change", "staff", userId.data, { op: "delete", login });
  revalidatePath("/admin/staff");
  return {
    ok: true,
    message: login === "kept_donor" ? `${staff.display_name} no longer has staff access. Their donor account is unchanged.`
      : login === "deleted" ? `${staff.display_name} was deleted.` : `${staff.display_name} was removed and can no longer sign in.`,
  };
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
