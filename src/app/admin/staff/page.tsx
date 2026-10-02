import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { setStaffActive } from "@/lib/admin/staff-actions";
import { InviteStaffButton } from "@/components/admin/invite-staff-dialog";
import { ChangeRoleButton } from "@/components/admin/change-role-dialog";
import { SimpleForm } from "@/components/donor/forms";
import { StatusDot } from "@/components/donor/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff" };

/** Space between the buttons and the right edge of the table (Tailwind padding: pr-0, pr-2, pr-4, pr-8…). */
const ACTIONS_BUFFER = "pr-2";
/** Space between the Change role and Activate/Deactivate buttons; they always stay on one line. */
const BUTTONS_GAP = "gap-6";
const th = "whitespace-nowrap px-4 py-3 font-semibold";
const td = "px-4 py-3 align-middle";

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

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Staff</h1>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link className="font-semibold text-teal-600 hover:underline" href="/admin/staff/roles">Roles and permissions</Link>
          <InviteStaffButton roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name }))} />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[60rem] table-fixed text-left">
          <caption className="sr-only">Staff</caption>
          {/* Column widths. The buttons column is a fixed size so both buttons always fit on one line; the other four
              share the rest. Edit the numbers to adjust (keep the four percentages adding up to about 75%). */}
          <colgroup>
            <col className="w-[12%]" />{/* Status */}
            <col className="w-[20%]" />{/* Name */}
            <col className="w-[18%]" />{/* Role */}
            <col className="w-[25%]" />{/* Email */}
            <col className="w-[19rem]" />{/* Change role / Deactivate (fixed) */}
          </colgroup>
          <thead><tr className="text-sm">
            <th scope="col" className={th}>Status</th>
            <th scope="col" className={th}>Name</th>
            <th scope="col" className={th}>Role</th>
            <th scope="col" className={th}>Email</th>
            <th scope="col" className={th}><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>{(staff ?? []).map((s) => {
            const mine = (assigns ?? []).filter((a) => a.user_id === s.user_id);
            return (
              <tr key={s.user_id} className="border-b border-line">
                <td className={td}><StatusDot status={s.active ? "active" : "inactive"} label={s.active ? "Active" : "Deactivated"} /></td>
                <td className={td + " font-semibold"}>{s.display_name}</td>
                <td className={td}>{mine.length ? mine.map((a) => roleName.get(a.role_id)).join(", ") : <span className="text-ink-soft">No role</span>}</td>
                <td className={td + " break-all text-sm text-ink-soft"}>{email.get(s.user_id)}</td>
                <td className={`${td} ${ACTIONS_BUFFER}`}>
                  <div className={`flex flex-nowrap items-start ${BUTTONS_GAP}`}>
                    <ChangeRoleButton userId={s.user_id} name={s.display_name} roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name }))} current={mine.map((a) => a.role_id)} />
                    <SimpleForm action={setStaffActive} submit={s.active ? "Deactivate" : "Activate"} tone={s.active ? "danger" : "primary"}>
                      <input type="hidden" name="userId" value={s.user_id} /><input type="hidden" name="active" value={s.active ? "false" : "true"} />
                    </SimpleForm>
                  </div>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>

    </>
  );
}
