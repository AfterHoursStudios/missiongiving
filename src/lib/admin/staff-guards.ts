/**
 * Would this change leave the organization with no active Super Admin? Used to block lockouts.
 * `activeSuperAdmins` are the user ids that currently hold super_admin AND are active.
 */
export function wouldRemoveLastSuperAdmin(activeSuperAdmins: string[], affectedUserId: string): boolean {
  return activeSuperAdmins.includes(affectedUserId) && activeSuperAdmins.filter((id) => id !== affectedUserId).length === 0;
}

/** Only Super Admins may grant/revoke the Super Admin role or change what a role is allowed to do. */
export function canManageRole(actorIsSuperAdmin: boolean, roleKey: string): boolean {
  return roleKey === "super_admin" ? actorIsSuperAdmin : true;
}

/** The permission matrix is edited only by Super Admins; the Super Admin role itself is immutable so it can never be emptied. */
export function canEditRolePermissions(actorIsSuperAdmin: boolean, roleKey: string): boolean {
  return actorIsSuperAdmin && roleKey !== "super_admin";
}
