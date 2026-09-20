export const PERMISSIONS = [
  "donors.view", "donors.edit", "finance.view", "donors.export", "refunds.issue",
  "tiers.manage", "projects.manage", "expenses.record", "reports.view",
  "comms.send", "staff.manage", "settings.manage", "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Mirror of the seeded role matrix (migration 0002). The database is the source of truth. */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  finance_admin: ["finance.view", "refunds.issue", "expenses.record", "reports.view", "donors.view"],
  fundraising_manager: ["donors.view", "projects.manage", "tiers.manage", "comms.send", "reports.view"],
  donor_services: ["donors.view", "donors.edit"],
  communications: ["comms.send", "projects.manage"],
  read_only: ["reports.view"],
};

export function can(granted: ReadonlySet<string> | readonly string[], perm: Permission): boolean {
  return (granted instanceof Set ? granted : new Set(granted)).has(perm);
}
