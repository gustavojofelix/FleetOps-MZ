import {
  ACTIVE_TRIP_STATUSES,
  CargoType,
  Driver,
  IsoDate,
  IsoDateTime,
  Trailer,
  TrailerType,
  Trip,
  TripStatus,
  Vehicle,
} from '../models';
import { daysBetween, dateOfTimestamp } from '../formatting/date-utils';

/** Allowed manual status transitions (dispatch board, trip detail). */
export const TRIP_STATUS_TRANSITIONS: Readonly<Record<TripStatus, readonly TripStatus[]>> = {
  planned: ['preparing', 'cancelled'],
  preparing: ['in_transit', 'planned', 'cancelled'],
  in_transit: ['delayed', 'delivered'],
  delayed: ['in_transit', 'delivered'],
  delivered: ['completed', 'in_transit'],
  completed: [],
  cancelled: ['planned'],
};

export function allowedTransitions(status: TripStatus): readonly TripStatus[] {
  return TRIP_STATUS_TRANSITIONS[status];
}

export function canTransition(from: TripStatus, to: TripStatus): boolean {
  return TRIP_STATUS_TRANSITIONS[from].includes(to);
}

/** Trailer types able to carry each cargo type. */
export const COMPATIBLE_TRAILERS: Readonly<Record<CargoType, readonly TrailerType[]>> = {
  container: ['skeletal', 'flatbed'],
  bulk: ['tipper', 'flatbed', 'tautliner'],
  general: ['flatbed', 'tautliner', 'skeletal'],
  fuel: ['tanker'],
  refrigerated: ['refrigerated'],
  abnormal: ['lowbed', 'flatbed'],
};

/** ISO 6346 container number: 3-letter owner code, category U/J/Z, 6 digits and a check digit. */
export function isValidContainerNumber(value: string): boolean {
  const code = value.replace(/\s/g, '').toUpperCase();
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(code)) return false;
  const alphabet = '0123456789A?BCDEFGHIJK?LMNOPQRSTU?VWXYZ';
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += alphabet.indexOf(code[i]) * 2 ** i;
  return (sum % 11) % 10 === Number(code[10]);
}

function overlaps(aStart: IsoDateTime, aEnd: IsoDateTime, bStart: IsoDateTime, bEnd: IsoDateTime): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

export type AssignmentIssueCode =
  | 'vehicle_unavailable'
  | 'vehicle_busy'
  | 'driver_unavailable'
  | 'driver_busy'
  | 'driver_licence_expired'
  | 'driver_licence_expires_during_trip'
  | 'driver_not_cross_border'
  | 'trailer_unavailable'
  | 'trailer_busy'
  | 'trailer_incompatible'
  | 'trailer_required'
  | 'overweight'
  | 'arrival_before_departure';

export interface AssignmentIssue {
  code: AssignmentIssueCode;
  /** Blocking issues prevent saving; others are warnings. */
  blocking: boolean;
  params: Record<string, string | number>;
}

export interface AssignmentCheckInput {
  tripId: string | null;
  vehicle: Vehicle | undefined;
  driver: Driver | undefined;
  trailer: Trailer | undefined;
  cargoType: CargoType;
  weightTonnes: number;
  crossBorder: boolean;
  plannedDeparture: IsoDateTime | null;
  plannedArrival: IsoDateTime | null;
  /** Other trips used to detect overlapping assignments. */
  trips: readonly Trip[];
  today: IsoDate;
}

/** Validates the vehicle/driver/trailer combination for a trip. Pure and unit-tested. */
export function checkTripAssignment(input: AssignmentCheckInput): AssignmentIssue[] {
  const issues: AssignmentIssue[] = [];
  const { vehicle, driver, trailer, plannedDeparture, plannedArrival } = input;

  if (plannedDeparture && plannedArrival && new Date(plannedArrival) <= new Date(plannedDeparture)) {
    issues.push({ code: 'arrival_before_departure', blocking: true, params: {} });
  }

  const busyTrips = input.trips.filter(
    (trip) =>
      trip.id !== input.tripId &&
      (ACTIVE_TRIP_STATUSES.includes(trip.status) || trip.status === 'planned') &&
      plannedDeparture &&
      plannedArrival &&
      overlaps(trip.plannedDeparture, trip.plannedArrival, plannedDeparture, plannedArrival),
  );

  if (vehicle) {
    if (vehicle.status === 'maintenance' || vehicle.status === 'inactive') {
      issues.push({ code: 'vehicle_unavailable', blocking: true, params: { status: vehicle.status } });
    }
    const conflict = busyTrips.find((trip) => trip.vehicleId === vehicle.id);
    if (conflict) issues.push({ code: 'vehicle_busy', blocking: true, params: { trip: conflict.reference } });
    if (vehicle.type === 'truck_tractor' && !trailer) {
      issues.push({ code: 'trailer_required', blocking: false, params: {} });
    }
  }

  if (driver) {
    if (driver.status === 'inactive' || driver.status === 'on_leave') {
      issues.push({ code: 'driver_unavailable', blocking: true, params: { status: driver.status } });
    }
    const conflict = busyTrips.find((trip) => trip.driverId === driver.id);
    if (conflict) issues.push({ code: 'driver_busy', blocking: true, params: { trip: conflict.reference } });
    if (driver.licenceExpiry < input.today) {
      issues.push({ code: 'driver_licence_expired', blocking: true, params: { date: driver.licenceExpiry } });
    } else if (plannedArrival && driver.licenceExpiry < dateOfTimestamp(plannedArrival)) {
      issues.push({ code: 'driver_licence_expires_during_trip', blocking: false, params: { date: driver.licenceExpiry } });
    }
    if (input.crossBorder && !driver.crossBorderAuthorized) {
      issues.push({ code: 'driver_not_cross_border', blocking: true, params: {} });
    }
  }

  if (trailer) {
    if (trailer.status === 'maintenance' || trailer.status === 'inactive') {
      issues.push({ code: 'trailer_unavailable', blocking: true, params: { status: trailer.status } });
    }
    const conflict = busyTrips.find((trip) => trip.trailerId === trailer.id);
    if (conflict) issues.push({ code: 'trailer_busy', blocking: true, params: { trip: conflict.reference } });
    if (!COMPATIBLE_TRAILERS[input.cargoType].includes(trailer.type)) {
      issues.push({ code: 'trailer_incompatible', blocking: true, params: { type: trailer.type } });
    }
  }

  const capacity = trailer ? trailer.capacityTonnes : vehicle && vehicle.type !== 'truck_tractor' ? vehicle.payloadTonnes : null;
  if (capacity !== null && input.weightTonnes > capacity) {
    issues.push({ code: 'overweight', blocking: true, params: { weight: input.weightTonnes, capacity } });
  }

  return issues;
}

/** Hours a trip is behind schedule (positive = late), using actual times when available. */
export function delayHours(trip: Pick<Trip, 'plannedArrival' | 'actualArrival' | 'status'>, now: IsoDateTime): number {
  const reference = trip.actualArrival ?? (trip.status === 'in_transit' || trip.status === 'delayed' ? now : null);
  if (!reference) return 0;
  return Math.max(0, (new Date(reference).getTime() - new Date(trip.plannedArrival).getTime()) / 3_600_000);
}

export function tripDurationDays(trip: Pick<Trip, 'plannedDeparture' | 'plannedArrival'>): number {
  return Math.max(1, daysBetween(dateOfTimestamp(trip.plannedDeparture), dateOfTimestamp(trip.plannedArrival)) + 1);
}
