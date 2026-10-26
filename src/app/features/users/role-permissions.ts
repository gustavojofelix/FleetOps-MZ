import { PERMISSIONS, Permission, UserRole } from '../../core/models';

/**
 * Demo role → permission mapping, used only to display the matrix. It does not restrict
 * anything in the UI: real enforcement belongs to the backend (Supabase Auth + Row Level Security).
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
