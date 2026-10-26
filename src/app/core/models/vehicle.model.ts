import { AuditStamps, IsoDate, TenantScoped } from './common.model';

export type VehicleStatus = 'available' | 'in_transit' | 'maintenance' | 'inactive';
export type VehicleType = 'truck_tractor' | 'rigid_truck' | 'tanker' | 'tipper' | 'light_vehicle';
export type FuelType = 'diesel' | 'petrol';

export const VEHICLE_STATUSES: readonly VehicleStatus[] = ['available', 'in_transit', 'maintenance', 'inactive'];
export const VEHICLE_TYPES: readonly VehicleType[] = ['truck_tractor', 'rigid_truck', 'tanker', 'tipper', 'light_vehicle'];

export interface VehicleStatusChange {
  date: IsoDate;
  from: VehicleStatus;
  to: VehicleStatus;
  reason: string;
}

export interface Vehicle extends TenantScoped, AuditStamps {
  plateNumber: string;
  fleetNumber: string;
  make: string;
  model: string;
  year: number;
  type: VehicleType;
  status: VehicleStatus;
  fuelType: FuelType;
  vin: string;
  odometerKm: number;
  tankCapacityL: number;
  /** Reference consumption used to flag unusual fuel readings. */
  expectedConsumptionL100km: number;
  payloadTonnes: number;
  assignedDriverId: string | null;
  linkedTrailerId: string | null;
  acquisitionDate: IsoDate;
  notes: string;
  statusHistory: VehicleStatusChange[];
}
