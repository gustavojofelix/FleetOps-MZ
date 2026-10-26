import { TripProfitability, calculateTripProfitability } from '../../core/domain/profitability';
import { Trip } from '../../core/models';
import {
  bestAndWorst,
  chartMonths,
  groupRows,
  marginTone,
  monthlyProfitability,
  rankByMargin,
  routeKey,
  selectTripRows,
  sortBy,
  totalsOf,
} from './profitability-data';

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 't1',
    organizationId: 'org',
    reference: 'VG-1',
    customerId: 'c1',
    vehicleId: 'v1',
    driverId: 'd1',
    trailerId: null,
    routeId: null,
    origin: { city: 'Beira', country: 'MZ', site: '' },
    destination: { city: 'Tete', country: 'MZ', site: '' },
    plannedDistanceKm: 500,
    actualDistanceKm: null,
    cargo: { type: 'general', description: '', weightTonnes: 10, containerRef: null, sealNumber: null },
    plannedDeparture: '2026-09-10T06:00:00+02:00',
    plannedArrival: '2026-09-10T20:00:00+02:00',
    actualDeparture: null,
    actualArrival: null,
    status: 'completed',
    revenue: { amount: 100_000, currency: 'MZN' },
    customerReference: '',
    delayReason: null,
    notes: '',
    timeline: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function resultsFor(trips: Trip[], fuelByTrip: Record<string, number> = {}): Map<string, TripProfitability> {
  const fuel = Object.entries(fuelByTrip).map(([tripId, amount], i) => ({
    id: `f${i}`,
    organizationId: 'org',
    reference: '',
    timestamp: '2026-09-10T10:00:00+02:00',
    vehicleId: 'v1',
    driverId: null,
    tripId,
    odometerKm: 0,
    litres: 1,
    pricePerLitre: { amount, currency: 'MZN' as const },
    totalAmount: { amount, currency: 'MZN' as const },
    fullTank: true,
    station: '',
    location: '',
    receiptFileName: null,
    notes: '',
    createdAt: '',
    updatedAt: '',
  }));
  return new Map(trips.map((t) => [t.id, calculateTripProfitability(t, { fuel, expenses: [] }, 'MZN')]));
}

describe('profitability view helpers', () => {
  const trips = [
    trip({ id: 'a', customerId: 'c1' }),
    trip({ id: 'b', customerId: 'c1', vehicleId: 'v2', plannedDeparture: '2026-10-02T06:00:00+02:00' }),
    trip({ id: 'c', customerId: 'c2', status: 'in_transit', destination: { city: 'Harare', country: 'ZW', site: '' } }),
    trip({ id: 'd', status: 'cancelled' }),
    trip({ id: 'e', plannedDeparture: '2026-06-01T06:00:00+02:00' }),
  ];
  const results = resultsFor(trips, { a: 40_000, b: 110_000, c: 10_000 });

  it('selects finished trips in the period and optionally provisional ones', () => {
    const finished = selectTripRows(trips, results, { from: '2026-09-01', to: '2026-10-31', scope: 'finished' });
    expect(finished.map((row) => row.trip.id)).toEqual(['a', 'b']);
    const provisional = selectTripRows(trips, results, { from: '2026-09-01', to: '2026-10-31', scope: 'provisional' });
    expect(provisional.map((row) => row.trip.id)).toEqual(['a', 'b', 'c']);
    expect(provisional[2].result.provisional).toBe(true);
    // Cancelled trips never count.
    expect(selectTripRows(trips, results, { from: null, to: null, scope: 'provisional' }).some((row) => row.trip.id === 'd')).toBe(false);
  });

  it('totals reuse the domain aggregation (ratio from totals)', () => {
    const rows = selectTripRows(trips, results, { from: '2026-09-01', to: '2026-10-31', scope: 'finished' });
    const totals = totalsOf(rows);
    expect(totals.trips).toBe(2);
    expect(totals.revenue).toBe(200_000);
    expect(totals.totalDirectCosts).toBe(150_000);
    expect(totals.contributionMargin).toBe(50_000);
    expect(totals.marginRatio).toBe(0.25);
    expect(totals.costPerKm).toBe(150);
    expect(totals.revenuePerKm).toBe(200);
  });

  it('returns empty totals without dividing by zero', () => {
    const totals = totalsOf([]);
    expect(totals.trips).toBe(0);
    expect(totals.marginRatio).toBeNull();
    expect(totals.costPerKm).toBeNull();
  });

  it('groups by customer, vehicle and route', () => {
    const rows = selectTripRows(trips, results, { from: '2026-09-01', to: '2026-10-31', scope: 'provisional' });
    const customers = groupRows(rows, 'customer');
    expect(customers.find((g) => g.key === 'c1')?.trips).toBe(2);
    expect(customers.find((g) => g.key === 'c2')?.provisionalTrips).toBe(1);
    const routes = groupRows(rows, 'route');
    expect(routes.map((g) => g.key).sort()).toEqual(['Beira → Harare', 'Beira → Tete']);
    expect(groupRows(rows, 'vehicle').length).toBe(2);
    expect(routeKey(trips[0])).toBe('Beira → Tete');
  });

  it('builds monthly series aligned to the period months', () => {
    const rows = selectTripRows(trips, results, { from: '2026-09-01', to: '2026-10-31', scope: 'finished' });
    const months = chartMonths(rows, '2026-08-15', '2026-10-31');
    expect(months).toEqual(['2026-08', '2026-09', '2026-10']);
    const monthly = monthlyProfitability(rows, months);
    expect(monthly.revenue).toEqual([0, 100_000, 100_000]);
    expect(monthly.buckets.fuel).toEqual([0, 40_000, 110_000]);
    expect(monthly.margin).toEqual([0, 60_000, -10_000]);
    expect(chartMonths(rows, null, null)).toEqual(['2026-09', '2026-10']);
  });

  it('ranks by margin with negative margins and no-revenue groups handled', () => {
    const groups = [
      { key: 'x', marginRatio: 0.1, revenue: 10 },
      { key: 'y', marginRatio: null, revenue: 0 },
      { key: 'z', marginRatio: -0.2, revenue: 50 },
      { key: 'w', marginRatio: 0.4, revenue: 5 },
    ];
    expect(rankByMargin(groups).map((g) => g.key)).toEqual(['w', 'x', 'z', 'y']);
    const { best, worst } = bestAndWorst(groups);
    expect(best?.key).toBe('w');
    expect(worst?.key).toBe('z');
    expect(bestAndWorst([groups[0]]).worst).toBeNull();
  });

  it('maps margin ratios to tones', () => {
    expect(marginTone(-0.01)).toBe('danger');
    expect(marginTone(0.19)).toBe('warning');
    expect(marginTone(0.2)).toBe('success');
    expect(marginTone(null)).toBe('neutral');
  });

  it('sorts with nulls last in both directions', () => {
    const items = [{ v: 2 }, { v: null }, { v: 5 }, { v: 1 }];
    expect(sortBy(items, (i) => i.v, 'asc').map((i) => i.v)).toEqual([1, 2, 5, null]);
    expect(sortBy(items, (i) => i.v, 'desc').map((i) => i.v)).toEqual([5, 2, 1, null]);
  });
});
