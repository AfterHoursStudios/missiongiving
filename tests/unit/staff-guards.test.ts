import { describe, expect, it } from "vitest";
import { canEditRolePermissions, canManageRole, wouldRemoveLastSuperAdmin } from "@/lib/admin/staff-guards";

describe("last Super Admin protection", () => {
  it("blocks removing or deactivating the only active Super Admin", () => {
    expect(wouldRemoveLastSuperAdmin(["a"], "a")).toBe(true);
  });
  it("allows it when another active Super Admin remains, or the person is not one", () => {
    expect(wouldRemoveLastSuperAdmin(["a", "b"], "a")).toBe(false);
    expect(wouldRemoveLastSuperAdmin(["a"], "someone-else")).toBe(false);
    expect(wouldRemoveLastSuperAdmin([], "a")).toBe(false);
  });
});

describe("privilege escalation guards", () => {
  it("only Super Admins can manage the Super Admin role", () => {
    expect(canManageRole(false, "super_admin")).toBe(false);
    expect(canManageRole(true, "super_admin")).toBe(true);
    expect(canManageRole(false, "donor_services")).toBe(true);
  });
  it("only Super Admins edit permissions, and never the Super Admin role", () => {
    expect(canEditRolePermissions(false, "finance_admin")).toBe(false);
    expect(canEditRolePermissions(true, "finance_admin")).toBe(true);
    expect(canEditRolePermissions(true, "super_admin")).toBe(false);
  });
});
