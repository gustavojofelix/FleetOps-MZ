import { PERMISSIONS, Permission, UserRole } from '../models';

/**
 * Role → permission mapping. The UI uses it to hide actions a role cannot perform
 * (PermissionService, *appCan); the database enforces the same rules with RLS policies and
 * triggers (supabase/migrations), so hiding is a convenience, never the protection.
 */
export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS,
  fleet_manager: [
    'fleet.view',
    'fleet.manage',
    'trips.view',
    'trips.manage',
    'costs.view',
    'costs.manage',
    'reports.view',
    'documents.manage',
  ],
  dispatcher: ['fleet.view', 'trips.view', 'trips.manage', 'costs.view'],
  finance: ['fleet.view', 'trips.view', 'costs.view', 'costs.manage', 'costs.approve', 'reports.view'],
  viewer: ['fleet.view', 'trips.view', 'costs.view', 'reports.view'],
};

/** Roles that can be assigned through invitations or role changes (there is a single owner). */
export const ASSIGNABLE_ROLES: readonly UserRole[] = ['admin', 'fleet_manager', 'dispatcher', 'finance', 'viewer'];

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
