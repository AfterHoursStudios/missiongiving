import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, can } from "@/lib/auth/permissions";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";

describe("role matrix", () => {
  it("super admin has everything", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.super_admin).toEqual(PERMISSIONS);
  });
  it("least privilege for restricted roles", () => {
    expect(can(DEFAULT_ROLE_PERMISSIONS.read_only, "reports.view")).toBe(true);
    for (const p of PERMISSIONS.filter((p) => p !== "reports.view"))
      expect(can(DEFAULT_ROLE_PERMISSIONS.read_only, p)).toBe(false);
  });
  it("only super admin can export donors, manage staff or settings, or view audit", () => {
    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      if (role === "super_admin") continue;
      for (const p of ["donors.export", "staff.manage", "settings.manage", "audit.view"] as const)
        expect(can(perms, p), `${role} must not have ${p}`).toBe(false);
    }
  });
  it("only finance and super admin can refund", () => {
    const withRefund = Object.entries(DEFAULT_ROLE_PERMISSIONS).filter(([, p]) => can(p, "refunds.issue")).map(([r]) => r);
    expect(withRefund.sort()).toEqual(["finance_admin", "super_admin"]);
  });
});

describe("rateLimit", () => {
  it("blocks after the limit and recovers after the window", () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, 0).ok).toBe(true);
    expect(rateLimit("k", 3, 1000, 10).ok).toBe(false);
    expect(rateLimit("k", 3, 1000, 1500).ok).toBe(true);
  });
});
