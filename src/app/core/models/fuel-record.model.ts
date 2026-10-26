import { AuditStamps, IsoDateTime, TenantScoped } from './common.model';
import { Money } from './money.model';

export interface FuelRecord extends TenantScoped, AuditStamps {
  reference: string;
  timestamp: IsoDateTime;
  vehicleId: string;
  driverId: string | null;
  tripId: string | null;
  odometerKm: number;
  litres: number;
  pricePerLitre: Money;
  totalAmount: Money;
  fullTank: boolean;
  station: string;
  location: string;
  receiptFileName: string | null;
  notes: string;
}

export type FuelWarningCode =
  | 'odometer_regression'
  | 'exceeds_tank_capacity'
  | 'high_consumption'
  | 'low_consumption'
  | 'total_mismatch';

export interface FuelWarning {
  code: FuelWarningCode;
  /** Values interpolated into the translated message. */
  params: Record<string, string | number>;
}
