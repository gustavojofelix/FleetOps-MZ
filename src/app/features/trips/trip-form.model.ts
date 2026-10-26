import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../../core/formatting/date-utils';
import { CargoType, CurrencyCode, RouteDefinition, Trip, VehicleType } from '../../core/models';
import type { TripInput } from '../../core/services/trip-workflow.service';

/** Flat value of the trip create / edit form. Datetimes are `datetime-local` strings in company time. */
export interface TripFormValue {
  routeId: string;
  originCity: string;
  originSite: string;
  originCountry: string;
  destinationCity: string;
  destinationSite: string;
  destinationCountry: string;
  plannedDistanceKm: number | null;
  customerId: string;
  customerReference: string;
  cargoType: CargoType;
  cargoDescription: string;
  weightTonnes: number | null;
  containerRef: string;
  sealNumber: string;
  vehicleId: string;
  driverId: string;
  trailerId: string;
  plannedDeparture: string;
  plannedArrival: string;
  revenueAmount: number | null;
  revenueCurrency: CurrencyCode;
  notes: string;
}

export const TRIP_COUNTRIES: readonly string[] = ['MZ', 'ZW', 'MW', 'ZM', 'ZA'];

export function emptyTripForm(currency: CurrencyCode = 'USD'): TripFormValue {
  return {
    routeId: '',
    originCity: '',
    originSite: '',
    originCountry: 'MZ',
    destinationCity: '',
    destinationSite: '',
    destinationCountry: 'MZ',
    plannedDistanceKm: null,
    customerId: '',
    customerReference: '',
    cargoType: 'container',
    cargoDescription: '',
    weightTonnes: null,
    containerRef: '',
    sealNumber: '',
    vehicleId: '',
    driverId: '',
    trailerId: '',
    plannedDeparture: '',
    plannedArrival: '',
    revenueAmount: null,
    revenueCurrency: currency,
    notes: '',
  };
}

export function tripToFormValue(trip: Trip): TripFormValue {
  return {
    routeId: trip.routeId ?? '',
    originCity: trip.origin.city,
    originSite: trip.origin.site,
    originCountry: trip.origin.country,
    destinationCity: trip.destination.city,
    destinationSite: trip.destination.site,
    destinationCountry: trip.destination.country,
    plannedDistanceKm: trip.plannedDistanceKm,
    customerId: trip.customerId,
    customerReference: trip.customerReference,
    cargoType: trip.cargo.type,
    cargoDescription: trip.cargo.description,
    weightTonnes: trip.cargo.weightTonnes,
    containerRef: trip.cargo.containerRef ?? '',
    sealNumber: trip.cargo.sealNumber ?? '',
    vehicleId: trip.vehicleId,
    driverId: trip.driverId,
    trailerId: trip.trailerId ?? '',
    plannedDeparture: toDateTimeLocalValue(trip.plannedDeparture),
    plannedArrival: toDateTimeLocalValue(trip.plannedArrival),
    revenueAmount: trip.revenue.amount,
    revenueCurrency: trip.revenue.currency,
    notes: trip.notes,
  };
}

/** A new trip based on an existing one: same corridor, customer, cargo and crew; new schedule and references. */
export function duplicateFormValue(trip: Trip): TripFormValue {
  return {
    ...tripToFormValue(trip),
    customerReference: '',
    containerRef: '',
    sealNumber: '',
    plannedDeparture: '',
    plannedArrival: '',
  };
}

/** Fields prefilled when a route preset is chosen. */
export function routePrefill(route: RouteDefinition): Partial<TripFormValue> {
  return {
    routeId: route.id,
    originCity: route.origin.city,
    originSite: route.origin.site,
    originCountry: route.origin.country,
    destinationCity: route.destination.city,
    destinationSite: route.destination.site,
    destinationCountry: route.destination.country,
    plannedDistanceKm: route.distanceKm,
  };
}

/** Cross-border when the preset says so or the countries differ. */
export function isCrossBorder(value: Pick<TripFormValue, 'originCountry' | 'destinationCountry'>, route?: RouteDefinition): boolean {
  return !!route?.crossBorder || (!!value.originCountry && !!value.destinationCountry && value.originCountry !== value.destinationCountry);
}

/** Suggested arrival (`datetime-local`) = departure + typical duration, rounded up to 5 minutes. */
export function suggestArrival(departureLocal: string, hours: number): string {
  if (!departureLocal || !(hours > 0)) return '';
  const start = Date.parse(`${departureLocal.slice(0, 16)}:00Z`);
  if (Number.isNaN(start)) return '';
  const step = 5 * 60_000;
  const end = Math.ceil((start + hours * 3_600_000) / step) * step;
  return new Date(end).toISOString().slice(0, 16);
}

/** Next `VG-<year>-NNNN` reference above the highest one used in that year. */
export function nextTripReference(references: readonly string[], year: string): string {
  const pattern = new RegExp(`^VG-${year}-(\\d+)$`);
  const max = references.reduce((highest, reference) => {
    const match = pattern.exec(reference);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `VG-${year}-${String(max + 1).padStart(4, '0')}`;
}

export function normalizeContainerRef(value: string): string {
  return value.replace(/\s/g, '').toUpperCase();
}

const trimOrNull = (value: string): string | null => value.trim() || null;

/** Maps the form to the workflow input. Container/seal only for containers; trailers only for tractors. */
export function toTripInput(value: TripFormValue, options: { reference: string; vehicleType: VehicleType | undefined }): TripInput {
  const isContainer = value.cargoType === 'container';
  return {
    reference: options.reference,
    customerId: value.customerId,
    vehicleId: value.vehicleId,
    driverId: value.driverId,
    trailerId: options.vehicleType === 'truck_tractor' ? trimOrNull(value.trailerId) : null,
    routeId: trimOrNull(value.routeId),
    origin: { city: value.originCity.trim(), site: value.originSite.trim(), country: value.originCountry },
    destination: { city: value.destinationCity.trim(), site: value.destinationSite.trim(), country: value.destinationCountry },
    plannedDistanceKm: Number(value.plannedDistanceKm ?? 0),
    cargo: {
      type: value.cargoType,
      description: value.cargoDescription.trim(),
      weightTonnes: Number(value.weightTonnes ?? 0),
      containerRef: isContainer ? trimOrNull(normalizeContainerRef(value.containerRef)) : null,
      sealNumber: isContainer ? trimOrNull(value.sealNumber.toUpperCase()) : null,
    },
    plannedDeparture: fromDateTimeLocalValue(value.plannedDeparture) ?? '',
    plannedArrival: fromDateTimeLocalValue(value.plannedArrival) ?? '',
    revenue: { amount: Number(value.revenueAmount ?? 0), currency: value.revenueCurrency },
    customerReference: value.customerReference.trim(),
    notes: value.notes.trim(),
  };
}
