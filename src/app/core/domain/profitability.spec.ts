import { Expense, FuelRecord, MaintenanceRecord, Trip } from '../models';
import {
  aggregateProfitability,
  calculateTripProfitability,
  contributionMargin,
  costBucketOf,
  maintenanceCostPerKm,
  marginRatio,
} from './profitability';

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
    plannedDeparture: '2026-10-01T06:00:00+02:00',
    plannedArrival: '2026-10-01T20:00:00+02:00',
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

function fuel(amount: number, currency: 'MZN' | 'USD' = 'MZN', tripId: string | null = 't1'): FuelRecord {
  return {
    id: `f-${amount}`,
    organizationId: 'org',
    reference: '',
    timestamp: '2026-10-01T10:00:00+02:00',
    vehicleId: 'v1',
    driverId: null,
    tripId,
    odometerKm: 0,
    litres: 1,
    pricePerLitre: { amount, currency },
    totalAmount: { amount, currency },
    fullTank: true,
    station: '',
    location: '',
    receiptFileName: null,
    notes: '',
    createdAt: '',
    updatedAt: '',
  };
}

function expense(amount: number, category: Expense['category'], approvalStatus: Expense['approvalStatus'] = 'approved', currency: 'MZN' | 'USD' = 'MZN'): Expense {
  return {
    id: `e-${category}-${amount}`,
    organizationId: 'org',
    reference: '',
    date: '2026-10-01',
    category,
    amount: { amount, currency },
    vehicleId: 'v1',
    tripId: 't1',
    driverId: null,
    vendor: '',
    description: '',
    paymentMethod: 'cash',
    approvalStatus,
    submittedByUserId: 'u1',
    receiptFileName: null,
    notes: '',
    createdAt: '',
    updatedAt: '',
  };
}

describe('profitability rules', () => {
  it('computes contribution margin as revenue minus direct costs', () => {
    expect(contributionMargin(100, 60)).toBe(40);
    expect(contributionMargin(100, 130)).toBe(-30);
  });

  it('returns null margin ratio for zero revenue instead of dividing by zero', () => {
    expect(marginRatio(0, -50)).toBeNull();
    expect(marginRatio(200, 50)).toBe(0.25);
  });

  it('maps expense categories to cost buckets', () => {
    expect(costBucketOf('tolls')).toBe('tolls_fees');
    expect(costBucketOf('border_fees')).toBe('tolls_fees');
    expect(costBucketOf('driver_allowance')).toBe('driver_allowance');
    expect(costBucketOf('repairs')).toBe('other');
  });

  it('sums fuel and non-rejected expenses linked to the trip', () => {
    const result = calculateTripProfitability(
      trip(),
      {
        fuel: [fuel(30_000), fuel(5_000, 'MZN', 'other-trip')],
        expenses: [expense(2_000, 'tolls'), expense(3_000, 'driver_allowance', 'pending'), expense(9_999, 'fines', 'rejected')],
      },
      'MZN',
    );
    expect(result.costs.fuel).toBe(30_000);
    expect(result.costs.tolls_fees).toBe(2_000);
    expect(result.costs.driver_allowance).toBe(3_000);
    expect(result.costs.other).toBe(0);
    expect(result.totalDirectCosts).toBe(35_000);
    expect(result.contributionMargin).toBe(65_000);
    expect(result.marginRatio).toBeCloseTo(0.65);
    expect(result.costPerKm).toBe(70);
    expect(result.usesSimulatedConversion).toBe(false);
  });

  it('converts foreign currencies with the simulated rates and flags it', () => {
    const result = calculateTripProfitability(
      trip({ revenue: { amount: 1_000, currency: 'USD' } }),
      { fuel: [fuel(100, 'USD')], expenses: [] },
      'MZN',
    );
    expect(result.revenue).toBe(63_900);
    expect(result.costs.fuel).toBe(6_390);
    expect(result.usesSimulatedConversion).toBe(true);
    // The original transaction value is preserved.
    expect(result.revenueOriginal).toEqual({ amount: 1_000, currency: 'USD' });
  });

  it('treats cancelled trips as zero revenue and marks in-progress trips as provisional', () => {
    const cancelled = calculateTripProfitability(trip({ status: 'cancelled' }), { fuel: [], expenses: [] }, 'MZN');
    expect(cancelled.revenue).toBe(0);
    expect(cancelled.marginRatio).toBeNull();
    const inTransit = calculateTripProfitability(trip({ status: 'in_transit' }), { fuel: [], expenses: [] }, 'MZN');
    expect(inTransit.provisional).toBe(true);
  });

  it('keeps maintenance allocation separate from the contribution margin', () => {
    const result = calculateTripProfitability(trip(), { fuel: [], expenses: [], maintenanceCostPerKm: new Map([['v1', 2]]) }, 'MZN');
    expect(result.maintenanceAllocation).toBe(1_000);
    expect(result.contributionMargin).toBe(100_000);
  });

  it('allocates completed maintenance per km driven (loaded + return legs)', () => {
    const record = { vehicleId: 'v1', status: 'completed', partsCost: 800, labourCost: 200, currency: 'MZN' } as MaintenanceRecord;
    const perKm = maintenanceCostPerKm([record], [trip()], 'MZN');
    expect(perKm.get('v1')).toBe(1);
  });

  it('aggregates groups and recomputes ratios from totals', () => {
    const a = calculateTripProfitability(trip({ id: 'a' }), { fuel: [], expenses: [] }, 'MZN');
    const b = calculateTripProfitability(trip({ id: 'b', revenue: { amount: 0, currency: 'MZN' } }), { fuel: [], expenses: [] }, 'MZN');
    const [group] = aggregateProfitability([
      { key: 'c1', result: a },
      { key: 'c1', result: b },
    ]);
    expect(group.trips).toBe(2);
    expect(group.revenue).toBe(100_000);
    expect(group.marginRatio).toBe(1);
  });
});
