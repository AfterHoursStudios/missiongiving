import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { assignRole, inviteStaff, setStaffActive } from "@/lib/admin/staff-actions";
import { SimpleForm, TextInput } from "@/components/donor/forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff" };

export default async function StaffPage() {
  await requirePermission("staff.manage");
  const db = createSupabaseAdminClient();
  const [{ data: staff }, { data: roles }, { data: assigns }, { data: profiles }] = await Promise.all([
    db.from("staff_profiles").select("user_id, display_name, active").order("display_name"),
    db.from("roles").select("id, key, name").order("name"),
    db.from("staff_role_assignments").select("user_id, role_id"),
    db.from("profiles").select("id, email"),
  ]);
  const email = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const roleName = new Map((roles ?? []).map((r) => [r.id, r.name]));
  const select = "min-h-11 rounded-md border border-ink-soft bg-white px-2";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Staff</h1>
        <Link className="underline" href="/admin/staff/roles">Roles and permissions</Link>
      </div>

      <ul className="mt-6 space-y-8">
        {(staff ?? []).map((s) => {
          const mine = (assigns ?? []).filter((a) => a.user_id === s.user_id);
          return (
            <li key={s.user_id} className="border-l-4 border-teal-600 pl-4">
              <p className="text-lg font-semibold">{s.display_name} {!s.active && <span className="text-danger">(deactivated)</span>}</p>
              <p className="text-sm text-ink-soft">{email.get(s.user_id)}</p>
              <p className="mt-1">Roles: {mine.length ? mine.map((a) => roleName.get(a.role_id)).join(", ") : "none"}</p>
              <div className="mt-3 flex flex-wrap gap-6">
                <SimpleForm action={assignRole} submit="Change role">
                  <input type="hidden" name="userId" value={s.user_id} />
                  <label htmlFor={`r-${s.user_id}`} className="sr-only">Role for {s.display_name}</label>
                  <select id={`r-${s.user_id}`} name="roleId" className={select}>{(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                  <label className="mr-4"><input type="radio" name="op" value="add" defaultChecked /> Add</label>
                  <label><input type="radio" name="op" value="remove" /> Remove</label>
                </SimpleForm>
                <SimpleForm action={setStaffActive} submit={s.active ? "Deactivate" : "Activate"} tone={s.active ? "danger" : "primary"}>
                  <input type="hidden" name="userId" value={s.user_id} /><input type="hidden" name="active" value={s.active ? "false" : "true"} />
                </SimpleForm>
              </div>
            </li>
          );
        })}
      </ul>

      <section aria-labelledby="invite" className="mt-14 max-w-md">
        <h2 id="invite" className="text-2xl font-semibold">Invite staff</h2>
        <p className="text-sm text-ink-soft">They receive an email invitation and choose their own password.</p>
        <div className="mt-4"><SimpleForm action={inviteStaff} submit="Send invitation">
          <TextInput label="Name" name="name" required /><TextInput label="Email" name="email" type="email" required />
          <label htmlFor="inv-role" className="block font-semibold">Role</label>
          <select id="inv-role" name="roleId" className={select + " w-full"}>{(roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </SimpleForm></div>
      </section>
    </>
  );
}
