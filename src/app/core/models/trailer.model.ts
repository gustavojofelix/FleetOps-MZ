import { AuditStamps, IsoDate, TenantScoped } from './common.model';

export type TrailerStatus = 'available' | 'in_use' | 'maintenance' | 'inactive';
export type TrailerType = 'flatbed' | 'skeletal' | 'tautliner' | 'tanker' | 'refrigerated' | 'lowbed' | 'tipper';

export const TRAILER_STATUSES: readonly TrailerStatus[] = ['available', 'in_use', 'maintenance', 'inactive'];
export const TRAILER_TYPES: readonly TrailerType[] = ['flatbed', 'skeletal', 'tautliner', 'tanker', 'refrigerated', 'lowbed', 'tipper'];

export interface Trailer extends TenantScoped, AuditStamps {
  plateNumber: string;
  fleetNumber: string;
  make: string;
  year: number;
  type: TrailerType;
  axles: number;
  capacityTonnes: number;
  /** Only set for tanker trailers. */
  capacityLitres: number | null;
  status: TrailerStatus;
  assignedVehicleId: string | null;
  lastInspectionDate: IsoDate;
  inspectionExpiry: IsoDate;
  notes: string;
}
