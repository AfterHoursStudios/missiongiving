import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { saveRolePermissions } from "@/lib/admin/staff-actions";
import { SimpleForm } from "@/components/donor/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roles and permissions" };

export default async function RolesPage() {
  await requirePermission("staff.manage");
  const db = createSupabaseAdminClient();
  const [{ data: roles }, { data: perms }, { data: rp }] = await Promise.all([
    db.from("roles").select("id, key, name, description").order("name"),
    db.from("permissions").select("key, description").order("key"),
    db.from("role_permissions").select("role_id, permission_key"),
  ]);
  return (
    <>
      <p><Link className="underline" href="/admin/staff">← Staff</Link></p>
      <h1 className="mt-2 text-3xl font-semibold">Roles and permissions</h1>
      <p className="mt-2 max-w-prose text-ink-soft">Only Super Admins can change these. The Super Admin role always has every permission and cannot be edited. Changes take effect on the person&apos;s next request and are audit-logged.</p>
      <div className="mt-8 space-y-10">
        {(roles ?? []).map((r) => {
          const has = new Set((rp ?? []).filter((x) => x.role_id === r.id).map((x) => x.permission_key));
          const locked = r.key === "super_admin";
          return (
            <section key={r.id} aria-labelledby={`h-${r.key}`}>
              <h2 id={`h-${r.key}`} className="text-2xl font-semibold">{r.name}</h2>
              {r.description && <p className="text-ink-soft">{r.description}</p>}
              <div className="mt-3"><SimpleForm action={saveRolePermissions} submit={locked ? "Locked" : "Save permissions"}>
                <input type="hidden" name="roleId" value={r.id} />
                <fieldset disabled={locked} className="grid gap-2 sm:grid-cols-2">
                  <legend className="sr-only">Permissions for {r.name}</legend>
                  {(perms ?? []).map((p) => (
                    <label key={p.key} className="flex items-start gap-3"><input type="checkbox" name="perm" value={p.key} defaultChecked={locked || has.has(p.key)} className="mt-1 size-5" /><span>{p.description}<span className="block text-xs text-ink-soft">{p.key}</span></span></label>
                  ))}
                </fieldset>
              </SimpleForm></div>
            </section>
          );
        })}
      </div>
    </>
  );
}
