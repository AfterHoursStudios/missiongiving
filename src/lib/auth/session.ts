import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { Permission } from "./permissions";

/** Verified user: validates the JWT with Supabase rather than trusting cookies alone. */
export async function getUser() {
  if (!isSupabaseConfigured) return null; // no backend: nobody is signed in (fail closed)
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function getStaffPermissions(userId: string): Promise<Set<string>> {
  const supabase = await createSupabaseServerClient();
  const { data: staff } = await supabase
    .from("staff_profiles").select("active").eq("user_id", userId).maybeSingle();
  if (!staff?.active) return new Set();
  const { data } = await supabase
    .from("staff_role_assignments")
    .select("roles(role_permissions(permission_key))")
    .eq("user_id", userId);
  const out = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[])
    for (const rp of row.roles?.role_permissions ?? []) out.add(rp.permission_key);
  return out;
}

/** Server-side gate for admin pages, actions and route handlers. */
export async function requirePermission(perm: Permission) {
  const user = await requireUser();
  const perms = await getStaffPermissions(user.id);
  if (!perms.has(perm)) redirect("/admin/forbidden");
  return { user, perms };
}
