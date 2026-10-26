import { AuditStamps, IsoDate, TenantScoped } from './common.model';
import { CurrencyCode } from './money.model';

export type MaintenanceType = 'preventive' | 'corrective' | 'inspection' | 'tyres' | 'bodywork' | 'electrical';
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
/** Derived for display: scheduled work whose planned date has passed. */
export type MaintenanceDisplayStatus = MaintenanceStatus | 'overdue';

export const MAINTENANCE_TYPES: readonly MaintenanceType[] = [
  'preventive',
  'corrective',
  'inspection',
  'tyres',
  'bodywork',
  'electrical',
];
export const MAINTENANCE_STATUSES: readonly MaintenanceStatus[] = ['scheduled', 'in_progress', 'completed', 'cancelled'];
export const MAINTENANCE_DISPLAY_STATUSES: readonly MaintenanceDisplayStatus[] = [
  'overdue',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
];

export interface MaintenanceRecord extends TenantScoped, AuditStamps {
  workOrderNumber: string;
  vehicleId: string;
  type: MaintenanceType;
  status: MaintenanceStatus;
  description: string;
  workshop: string;
  odometerKm: number;
  plannedDate: IsoDate;
  startedDate: IsoDate | null;
  completedDate: IsoDate | null;
  currency: CurrencyCode;
  partsCost: number;
  labourCost: number;
  downtimeHours: number;
  nextServiceKm: number | null;
  nextServiceDate: IsoDate | null;
  notes: string;
}
