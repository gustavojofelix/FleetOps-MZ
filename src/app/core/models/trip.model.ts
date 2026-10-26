import { AuditStamps, IsoDateTime, TenantScoped } from './common.model';
import { Money } from './money.model';

export type TripStatus = 'planned' | 'preparing' | 'in_transit' | 'delayed' | 'delivered' | 'completed' | 'cancelled';
export type CargoType = 'container' | 'bulk' | 'general' | 'fuel' | 'refrigerated' | 'abnormal';
export type TripEventType = 'created' | 'status_change' | 'checkpoint' | 'border_crossing' | 'note' | 'delay';

export const TRIP_STATUSES: readonly TripStatus[] = [
  'planned',
  'preparing',
  'in_transit',
  'delayed',
  'delivered',
  'completed',
  'cancelled',
];
export const CARGO_TYPES: readonly CargoType[] = ['container', 'bulk', 'general', 'fuel', 'refrigerated', 'abnormal'];

/** Statuses during which a vehicle, driver and trailer are committed to the trip. */
export const ACTIVE_TRIP_STATUSES: readonly TripStatus[] = ['preparing', 'in_transit', 'delayed'];

/** Statuses after which the cargo has reached the consignee. */
export const FINISHED_TRIP_STATUSES: readonly TripStatus[] = ['delivered', 'completed'];

export interface TripLocation {
  city: string;
  country: string;
  site: string;
}

export interface TripCargo {
  type: CargoType;
  description: string;
  weightTonnes: number;
  /** ISO 6346 container number when the cargo is containerised. */
  containerRef: string | null;
  sealNumber: string | null;
}

export interface TripEvent {
  id: string;
  timestamp: IsoDateTime;
  type: TripEventType;
  status: TripStatus | null;
  location: string;
  note: string;
}

export interface Trip extends TenantScoped, AuditStamps {
  reference: string;
  customerId: string;
  vehicleId: string;
  driverId: string;
  trailerId: string | null;
  routeId: string | null;
  origin: TripLocation;
  destination: TripLocation;
  plannedDistanceKm: number;
  actualDistanceKm: number | null;
  cargo: TripCargo;
  plannedDeparture: IsoDateTime;
  plannedArrival: IsoDateTime;
  actualDeparture: IsoDateTime | null;
  actualArrival: IsoDateTime | null;
  status: TripStatus;
  revenue: Money;
  customerReference: string;
  delayReason: string | null;
  notes: string;
  timeline: TripEvent[];
}
