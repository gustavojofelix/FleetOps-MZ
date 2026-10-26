import { AuditStamps, IsoDate, TenantScoped } from './common.model';

export type DriverStatus = 'active' | 'on_trip' | 'on_leave' | 'inactive';
export type LicenceCategory = 'B' | 'C1' | 'C' | 'C+E';
export type IncidentType = 'speeding' | 'accident' | 'cargo_damage' | 'late_delivery' | 'fine' | 'other';
export type IncidentSeverity = 'low' | 'medium' | 'high';

export const DRIVER_STATUSES: readonly DriverStatus[] = ['active', 'on_trip', 'on_leave', 'inactive'];
export const LICENCE_CATEGORIES: readonly LicenceCategory[] = ['B', 'C1', 'C', 'C+E'];
export const INCIDENT_TYPES: readonly IncidentType[] = ['speeding', 'accident', 'cargo_damage', 'late_delivery', 'fine', 'other'];

export interface DriverIncident {
  id: string;
  date: IsoDate;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  tripId: string | null;
}

export interface Driver extends TenantScoped, AuditStamps {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  city: string;
  nationalId: string;
  licenceNumber: string;
  licenceCategory: LicenceCategory;
  licenceExpiry: IsoDate;
  crossBorderAuthorized: boolean;
  hireDate: IsoDate;
  status: DriverStatus;
  assignedVehicleId: string | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  incidents: DriverIncident[];
  notes: string;
}
