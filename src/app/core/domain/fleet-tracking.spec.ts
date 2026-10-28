import { Driver, Trip } from '../models';
import { PLACES, ROUTE_PATHS, buildPath, isInMapRegion, nearestPlace, tripPath, fractionOfPlace, pointAlong, splitPath, trackFleet, trackTrip } from './fleet-tracking';

const trip = (overrides: Partial<Trip>) =>
  ({
    id: 'trp1',
    driverId: 'd1',
    vehicleId: 'v1',
    routeId: 'r-bei-chi',
    origin: { city: 'Beira', country: 'MZ', site: '' },
    destination: { city: 'Chimoio', country: 'MZ', site: '' },
    plannedDistanceKm: 200,
    plannedDeparture: '2026-10-24T08:00:00+02:00',
    plannedArrival: '2026-10-24T12:00:00+02:00',
    actualDeparture: '2026-10-24T08:00:00+02:00',
    status: 'in_transit',
    timeline: [],
    ...overrides,
  }) as Trip;

const at = (time: string) => Date.parse(`2026-10-24T${time}:00+02:00`);

describe('fleet tracking', () => {
  it('knows the coordinates of every corridor place', () => {
    for (const names of Object.values(ROUTE_PATHS)) {
      for (const name of names) expect(PLACES[name], name).toBeDefined();
    }
  });

  it('only maps the Beira corridor region', () => {
    for (const routeId of Object.keys(ROUTE_PATHS)) expect(isInMapRegion(tripPath(trip({ routeId }))), routeId).toBe(true);
    const southern = trip({ routeId: 'r-bei-jnb', destination: { city: 'Joanesburgo', country: 'ZA', site: '' } });
    expect(isInMapRegion(tripPath(southern))).toBe(false);

    const units = trackFleet([southern], [{ id: 'd1', status: 'on_trip', city: 'Beira' } as Driver], at('10:00'));
    expect(units).toEqual([]);
  });

  it('finds the nearest place to a position', () => {
    expect(nearestPlace(PLACES['Chimoio'])).toEqual({ name: 'Chimoio', km: 0 });
    const near = nearestPlace([-19.15, 33.5]);
    expect(near.name).toBe('Chimoio');
    expect(near.km).toBeGreaterThan(0);
  });

  it('interpolates along the path and splits it at the cut point', () => {
    const path = buildPath(['Beira', 'Dondo', 'Nhamatanda'])!;
    expect(pointAlong(path, 0)).toEqual(PLACES['Beira']);
    expect(pointAlong(path, 1)).toEqual(PLACES['Nhamatanda']);
    expect(fractionOfPlace(path, 'Dondo')).toBeCloseTo(path.cumulativeKm[1] / path.lengthKm);

    const { done, ahead } = splitPath(path, 0.5);
    expect(done[0]).toEqual(PLACES['Beira']);
    expect(done[done.length - 1]).toEqual(ahead[0]);
    expect(ahead[ahead.length - 1]).toEqual(PLACES['Nhamatanda']);
  });

  it('moves a trip in transit at a constant pace and stops it on arrival', () => {
    const half = trackTrip(trip({}), at('10:00'));
    expect(half.phase).toBe('moving');
    expect(half.progress).toBeCloseTo(0.5);
    expect(half.remainingKm).toBeCloseTo(100);
    expect(half.speedKmh).toBeCloseTo(50);
    expect(half.etaMs).toBe(at('12:00'));

    const done = trackTrip(trip({}), at('13:00'));
    expect(done.phase).toBe('arrived');
    expect(done.position).toEqual(PLACES['Chimoio']);
  });

  it('keeps trips in preparation loading at the origin until departure', () => {
    const prep = trip({ status: 'preparing', actualDeparture: null });
    expect(trackTrip(prep, at('07:00'))).toMatchObject({ phase: 'loading', progress: 0, position: PLACES['Beira'] });
    expect(trackTrip(prep, at('09:00')).phase).toBe('moving');
  });

  it('holds delayed trips where the delay was reported', () => {
    const delayed = trip({
      status: 'delayed',
      timeline: [{ id: 'e1', timestamp: '', type: 'delay', status: 'delayed', location: 'Inchope', note: '' }],
    });
    const unit = trackTrip(delayed, at('11:00'));
    expect(unit.phase).toBe('stopped');
    expect(unit.position).toEqual(PLACES['Inchope']);
    expect(unit.speedKmh).toBe(0);
  });

  it('parks on-duty drivers without an active trip in their town', () => {
    const drivers = [
      { id: 'd1', status: 'on_trip', city: 'Beira' },
      { id: 'd2', status: 'active', city: 'Tete', assignedVehicleId: 'v2' },
      { id: 'd3', status: 'on_leave', city: 'Tete' },
      { id: 'd4', status: 'active', city: 'Nowhere', assignedVehicleId: null },
    ] as Driver[];
    const units = trackFleet([trip({}), trip({ id: 'old', driverId: 'd9', status: 'completed' })], drivers, at('10:00'));
    expect(units.map((u) => [u.driverId, u.phase])).toEqual([
      ['d1', 'moving'],
      ['d2', 'idle'],
      ['d4', 'idle'],
    ]);
    expect(units[1].position).toEqual(PLACES['Tete']);
    expect(units[2].position).toEqual(PLACES['Beira']);
  });
});
