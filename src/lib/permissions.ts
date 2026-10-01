import type { Role } from "./constants";

// Single source of truth for who can do what.
export const PERMISSIONS = {
  "dashboard.view": ["OWNER", "ADMIN", "DISPATCHER", "FLEET_MANAGER", "ACCOUNTANT"],
  "loads.view": ["OWNER", "ADMIN", "DISPATCHER", "FLEET_MANAGER", "ACCOUNTANT"],
  "loads.edit": ["OWNER", "ADMIN", "DISPATCHER"],
  "tracking.view": ["OWNER", "ADMIN", "DISPATCHER", "FLEET_MANAGER"],
  "fleet.view": ["OWNER", "ADMIN", "DISPATCHER", "FLEET_MANAGER"],
  "fleet.edit": ["OWNER", "ADMIN", "FLEET_MANAGER"],
  "drivers.view": ["OWNER", "ADMIN", "DISPATCHER", "FLEET_MANAGER"],
  "drivers.edit": ["OWNER", "ADMIN", "FLEET_MANAGER"],
  "customers.view": ["OWNER", "ADMIN", "DISPATCHER", "ACCOUNTANT"],
  "customers.edit": ["OWNER", "ADMIN", "DISPATCHER", "ACCOUNTANT"],
  "finance.view": ["OWNER", "ADMIN", "ACCOUNTANT"],
  "finance.edit": ["OWNER", "ADMIN", "ACCOUNTANT"],
  "reports.view": ["OWNER", "ADMIN", "ACCOUNTANT", "FLEET_MANAGER"],
  "users.manage": ["OWNER", "ADMIN"],
  "audit.view": ["OWNER", "ADMIN"],
  "driver.portal": ["DRIVER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: string | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

export function homeFor(role: string) {
  return role === "DRIVER" ? "/driver" : "/dashboard";
}
