import { Driver, Trailer, Trip, Vehicle } from '../models';
import { canTransition, checkTripAssignment, delayHours, isValidContainerNumber } from './trip-rules';
import { expiryStatus, daysUntilExpiry } from './document-status';
import { maintenanceDisplayStatus } from './maintenance-rules';

const vehicle = { id: 'v1', type: 'truck_tractor', status: 'available', payloadTonnes: 30 } as Vehicle;
const driver = { id: 'd1', status: 'active', licenceExpiry: '2028-01-01', crossBorderAuthorized: true } as Driver;
const trailer = { id: 't1', type: 'skeletal', status: 'available', capacityTonnes: 34 } as Trailer;

const base = {
  tripId: null,
  vehicle,
  driver,
  trailer,
  cargoType: 'container' as const,
  weightTonnes: 26,
  crossBorder: false,
  plannedDeparture: '2026-10-25T06:00:00+02:00',
  plannedArrival: '2026-10-25T20:00:00+02:00',
  trips: [] as Trip[],
  today: '2026-10-24',
};

const codes = (input: Parameters<typeof checkTripAssignment>[0]) => checkTripAssignment(input).map((issue) => issue.code);

describe('trip assignment rules', () => {
  it('accepts a valid assignment', () => {
    expect(checkTripAssignment(base)).toEqual([]);
  });

  it('blocks vehicles in maintenance and drivers on leave or with expired licences', () => {
    expect(codes({ ...base, vehicle: { ...vehicle, status: 'maintenance' } })).toContain('vehicle_unavailable');
    expect(codes({ ...base, driver: { ...driver, status: 'on_leave' } })).toContain('driver_unavailable');
    expect(codes({ ...base, driver: { ...driver, licenceExpiry: '2026-10-01' } })).toContain('driver_licence_expired');
  });

  it('warns (without blocking) when the licence expires during the trip', () => {
    const issues = checkTripAssignment({ ...base, driver: { ...driver, licenceExpiry: '2026-10-24' } });
    expect(issues.find((i) => i.code === 'driver_licence_expires_during_trip')?.blocking).toBe(false);
  });

  it('detects overlapping trips for the same vehicle', () => {
    const other = { id: 'x', reference: 'VG-9', vehicleId: 'v1', driverId: 'd9', trailerId: null, status: 'planned', plannedDeparture: '2026-10-25T10:00:00+02:00', plannedArrival: '2026-10-26T10:00:00+02:00' } as Trip;
    expect(codes({ ...base, trips: [other] })).toContain('vehicle_busy');
    expect(codes({ ...base, tripId: 'x', trips: [other] })).not.toContain('vehicle_busy');
  });

  it('checks trailer compatibility, capacity, cross-border authorisation and dates', () => {
    expect(codes({ ...base, cargoType: 'fuel' })).toContain('trailer_incompatible');
    expect(codes({ ...base, weightTonnes: 40 })).toContain('overweight');
    expect(codes({ ...base, crossBorder: true, driver: { ...driver, crossBorderAuthorized: false } })).toContain('driver_not_cross_border');
    expect(codes({ ...base, plannedArrival: base.plannedDeparture })).toContain('arrival_before_departure');
  });

  it('validates ISO 6346 container numbers including the check digit', () => {
    expect(isValidContainerNumber('CSQU3054383')).toBe(true);
    expect(isValidContainerNumber('CSQU3054384')).toBe(false);
    expect(isValidContainerNumber('ABC123')).toBe(false);
  });

  it('allows only defined status transitions', () => {
    expect(canTransition('planned', 'preparing')).toBe(true);
    expect(canTransition('completed', 'planned')).toBe(false);
    expect(canTransition('in_transit', 'delayed')).toBe(true);
  });

  it('measures delay against the planned arrival', () => {
    expect(delayHours({ plannedArrival: '2026-10-24T10:00:00+02:00', actualArrival: null, status: 'delayed' }, '2026-10-24T13:00:00+02:00')).toBe(3);
    expect(delayHours({ plannedArrival: '2026-10-24T10:00:00+02:00', actualArrival: null, status: 'planned' }, '2026-10-24T13:00:00+02:00')).toBe(0);
  });
});

describe('expiry and maintenance status', () => {
  it('derives document status from the expiry date', () => {
    expect(expiryStatus(null, '2026-10-24')).toBe('no_expiry');
    expect(expiryStatus('2026-10-23', '2026-10-24')).toBe('expired');
    expect(expiryStatus('2026-11-10', '2026-10-24')).toBe('expiring');
    expect(expiryStatus('2027-01-10', '2026-10-24')).toBe('valid');
    expect(daysUntilExpiry('2026-10-30', '2026-10-24')).toBe(6);
  });

  it('shows scheduled work past its planned date as overdue', () => {
    expect(maintenanceDisplayStatus({ status: 'scheduled', plannedDate: '2026-10-20' }, '2026-10-24')).toBe('overdue');
    expect(maintenanceDisplayStatus({ status: 'scheduled', plannedDate: '2026-10-30' }, '2026-10-24')).toBe('scheduled');
    expect(maintenanceDisplayStatus({ status: 'completed', plannedDate: '2026-10-01' }, '2026-10-24')).toBe('completed');
  });
});
