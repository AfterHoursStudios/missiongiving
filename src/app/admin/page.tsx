import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export default async function AdminHome() {
  // Server-side gate: any staff member with at least report access. Individual sections re-check their own permission.
  const { perms } = await requirePermission("reports.view");
  return (
    <>
      <h1 className="text-3xl font-semibold">Admin</h1>
      <p className="mt-2 text-ink-soft">Dashboard metrics arrive in Phase 4. Your permissions:</p>
      <ul className="mt-4 list-disc pl-6">
        {[...perms].sort().map((p) => <li key={p}>{p}</li>)}
      </ul>
      {can(perms, "staff.manage") && <p className="mt-4">You can manage staff.</p>}
    </>
  );
}
