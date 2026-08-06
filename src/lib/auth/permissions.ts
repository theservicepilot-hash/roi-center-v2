export const Permissions = {
  REPORT_VIEW: "report.view",
  REPORT_MANAGE: "report.manage",
} as const;

export type Permission =
  (typeof Permissions)[keyof typeof Permissions];

const ROLE_PERMS: Record<string, Permission[]> = {
  read_only: [Permissions.REPORT_VIEW],
  staff: [Permissions.REPORT_VIEW, Permissions.REPORT_MANAGE],
  manager: [Permissions.REPORT_VIEW, Permissions.REPORT_MANAGE],
  agency_admin: [Permissions.REPORT_VIEW, Permissions.REPORT_MANAGE],
  super_admin: [Permissions.REPORT_VIEW, Permissions.REPORT_MANAGE],
};

export function permissionsForRole(
  role: string,
  grants: string[] = [],
  denies: string[] = [],
): Permission[] {
  const base = new Set(ROLE_PERMS[role] ?? [Permissions.REPORT_VIEW]);
  for (const g of grants) base.add(g as Permission);
  for (const d of denies) base.delete(d as Permission);
  return Array.from(base);
}

export function hasPermission(
  perms: string[],
  needed: Permission,
): boolean {
  return perms.includes(needed);
}
