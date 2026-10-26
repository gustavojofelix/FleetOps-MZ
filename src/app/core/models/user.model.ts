import { IsoDateTime } from './common.model';

export type UserRole = 'owner' | 'admin' | 'fleet_manager' | 'dispatcher' | 'finance' | 'viewer';
export type UserStatus = 'active' | 'inactive' | 'invited';
export type Permission =
  | 'fleet.view'
  | 'fleet.manage'
  | 'trips.view'
  | 'trips.manage'
  | 'costs.view'
  | 'costs.manage'
  | 'costs.approve'
  | 'reports.view'
  | 'documents.manage'
  | 'users.manage'
  | 'settings.manage';

export const USER_ROLES: readonly UserRole[] = ['owner', 'admin', 'fleet_manager', 'dispatcher', 'finance', 'viewer'];
export const USER_STATUSES: readonly UserStatus[] = ['active', 'invited', 'inactive'];
export const PERMISSIONS: readonly Permission[] = [
  'fleet.view',
  'fleet.manage',
  'trips.view',
  'trips.manage',
  'costs.view',
  'costs.manage',
  'costs.approve',
  'reports.view',
  'documents.manage',
  'users.manage',
  'settings.manage',
];

/** Organization membership. Enforcement belongs to the backend (RLS); the UI only displays it. */
export interface AppUser {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  role: UserRole;
  status: UserStatus;
  lastActiveAt: IsoDateTime | null;
  invitedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}
