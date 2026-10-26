import { RouteDefinition, Trip } from '../../core/models';
import {
  duplicateFormValue,
  emptyTripForm,
  isCrossBorder,
  nextTripReference,
  routePrefill,
  suggestArrival,
  toTripInput,
  tripToFormValue,
} from './trip-form.model';

const route: RouteDefinition = {
  id: 'r-bei-hre',
  origin: { city: 'Beira', country: 'MZ', site: 'Porto da Beira' },
  destination: { city: 'Harare', country: 'ZW', site: 'Msasa' },
  distanceKm: 560,
  typicalDurationHours: 14,
  crossBorder: true,
  borderPost: 'Machipanda / Forbes',
};

const trip = {
  id: 'trp1',
  reference: 'VG-2026-0401',
  customerId: 'c1',
  vehicleId: 'v1',
  driverId: 'd1',
  trailerId: 't1',
  routeId: 'r-bei-hre',
  origin: route.origin,
  destination: route.destination,
  plannedDistanceKm: 560,
  cargo: { type: 'container', description: 'Fertilizante', weightTonnes: 26, containerRef: 'MSKU1234565', sealNumber: 'S-1' },
  plannedDeparture: '2026-10-25T06:00:00+02:00',
  plannedArrival: '2026-10-25T20:00:00+02:00',
  revenue: { amount: 1800, currency: 'USD' },
  customerReference: 'PO-1',
  notes: 'Nota',
} as Trip;

describe('trip form mapping', () => {
  it('round-trips a trip through the form value', () => {
    const value = tripToFormValue(trip);
    expect(value.plannedDeparture).toBe('2026-10-25T06:00');
    const input = toTripInput(value, { reference: trip.reference, vehicleType: 'truck_tractor' });
    expect(input.plannedDeparture).toBe(trip.plannedDeparture);
    expect(input.plannedArrival).toBe(trip.plannedArrival);
    expect(input.cargo).toEqual(trip.cargo);
    expect(input.trailerId).toBe('t1');
    expect(input.routeId).toBe('r-bei-hre');
    expect(input.revenue).toEqual({ amount: 1800, currency: 'USD' });
  });

  it('drops container data for other cargo and trailers for non-tractors', () => {
    const value = { ...tripToFormValue(trip), cargoType: 'bulk' as const, containerRef: 'msku 1234565' };
    const input = toTripInput(value, { reference: 'VG-2026-0500', vehicleType: 'rigid_truck' });
    expect(input.cargo.containerRef).toBeNull();
    expect(input.cargo.sealNumber).toBeNull();
    expect(input.trailerId).toBeNull();
  });

  it('normalises container numbers and empty optional fields', () => {
    const value = { ...emptyTripForm('MZN'), containerRef: ' msku 1234565 ', sealNumber: '', routeId: '' };
    const input = toTripInput(value, { reference: 'VG-2026-0001', vehicleType: 'truck_tractor' });
    expect(input.cargo.containerRef).toBe('MSKU1234565');
    expect(input.cargo.sealNumber).toBeNull();
    expect(input.routeId).toBeNull();
    expect(input.trailerId).toBeNull();
  });

  it('clears schedule and references when duplicating', () => {
    const value = duplicateFormValue(trip);
    expect(value.plannedDeparture).toBe('');
    expect(value.customerReference).toBe('');
    expect(value.containerRef).toBe('');
    expect(value.vehicleId).toBe('v1');
  });

  it('prefills from a route preset and detects cross-border trips', () => {
    const prefill = routePrefill(route);
    expect(prefill.plannedDistanceKm).toBe(560);
    expect(isCrossBorder({ originCountry: 'MZ', destinationCountry: 'ZW' })).toBe(true);
    expect(isCrossBorder({ originCountry: 'MZ', destinationCountry: 'MZ' })).toBe(false);
    expect(isCrossBorder({ originCountry: 'MZ', destinationCountry: 'MZ' }, route)).toBe(true);
  });

  it('suggests an arrival from the typical duration', () => {
    expect(suggestArrival('2026-10-25T06:00', 14)).toBe('2026-10-25T20:00');
    expect(suggestArrival('2026-10-25T22:10', 1.5)).toBe('2026-10-25T23:40');
    expect(suggestArrival('2026-10-25T06:02', 1)).toBe('2026-10-25T07:05');
    expect(suggestArrival('', 4)).toBe('');
  });

  it('generates the next reference for the year', () => {
    expect(nextTripReference(['VG-2026-0401', 'VG-2026-0447', 'VG-2025-0999', 'X'], '2026')).toBe('VG-2026-0448');
    expect(nextTripReference([], '2027')).toBe('VG-2027-0001');
  });
});
