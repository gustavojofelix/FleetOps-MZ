import { calculateTripProfitability } from '../../core/domain/profitability';
import { Customer, Expense, FuelRecord, MaintenanceRecord, Trip } from '../../core/models';
import { TripRow, selectTripRows } from '../profitability/profitability-data';
import {
  cityCountries,
  customerPerformance,
  expensesByCategory,
  expensesByMonth,
  expensesInPeriod,
  fuelByMarket,
  fuelByVehicle,
  maintenanceByType,
  maintenanceInPeriod,
  monthLabels,
  monthlySum,
  periodMonths,
  revenueByMonthAndCurrency,
  routePerformance,
  totalsByCurrency,
  tripDurationHours,
  vehicleOperatingCosts,
} from './report-data';

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
    destination: { city: 'Harare', country: 'ZW', site: '' },
    plannedDistanceKm: 500,
    actualDistanceKm: null,
    cargo: { type: 'general', description: '', weightTonnes: 10, containerRef: null, sealNumber: null },
    plannedDeparture: '2026-09-10T06:00:00+02:00',
    plannedArrival: '2026-09-10T20:00:00+02:00',
    actualDeparture: null,
    actualArrival: null,
    status: 'completed',
    revenue: { amount: 1_000, currency: 'USD' },
    customerReference: '',
    delayReason: null,
    notes: '',
    timeline: [],
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function fuel(overrides: Partial<FuelRecord> = {}): FuelRecord {
  return {
    id: 'f1',
    organizationId: 'org',
    reference: '',
    timestamp: '2026-09-10T10:00:00+02:00',
    vehicleId: 'v1',
    driverId: null,
    tripId: null,
    odometerKm: 0,
    litres: 100,
    pricePerLitre: { amount: 90, currency: 'MZN' },
    totalAmount: { amount: 9_000, currency: 'MZN' },
    fullTank: true,
    station: '',
    location: 'Beira',
    receiptFileName: null,
    notes: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function expense(amount: number, overrides: Partial<Expense> = {}): Expense {
  return {
    id: `e${amount}`,
    organizationId: 'org',
    reference: '',
    date: '2026-09-12',
    category: 'tolls',
    amount: { amount, currency: 'MZN' },
    vehicleId: 'v1',
    tripId: null,
    driverId: null,
    vendor: '',
    description: '',
    paymentMethod: 'cash',
    approvalStatus: 'approved',
    submittedByUserId: 'u1',
    receiptFileName: null,
    notes: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function maintenance(overrides: Partial<MaintenanceRecord> = {}): MaintenanceRecord {
  return {
    id: 'm1',
    organizationId: 'org',
    workOrderNumber: 'OT-1',
    vehicleId: 'v1',
    type: 'preventive',
    status: 'completed',
    description: '',
    workshop: '',
    odometerKm: 0,
    plannedDate: '2026-09-01',
    startedDate: null,
    completedDate: '2026-09-02',
    currency: 'MZN',
    partsCost: 800,
    labourCost: 200,
    downtimeHours: 6,
    nextServiceKm: null,
    nextServiceDate: null,
    notes: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function rowsOf(trips: Trip[]): TripRow[] {
  const results = new Map(trips.map((t) => [t.id, calculateTripProfitability(t, { fuel: [], expenses: [] }, 'MZN')]));
  return selectTripRows(trips, results, { from: null, to: null, scope: 'finished' });
}

describe('report aggregations', () => {
  it('totals per currency keep the original sum next to the converted one', () => {
    const totals = totalsByCurrency(
      [
        { amount: 100, currency: 'USD' },
        { amount: 50, currency: 'USD' },
        { amount: 1_000, currency: 'MZN' },
      ],
      'MZN',
    );
    expect(totals[0]).toEqual({ currency: 'USD', count: 2, original: 150, reporting: 9_585, rate: 63.9 });
    expect(totals[1]).toEqual({ currency: 'MZN', count: 1, original: 1_000, reporting: 1_000, rate: 1 });
  });

  it('builds month buckets for open and closed periods', () => {
    expect(periodMonths(['2026-07-03', '2026-09-30T10:00:00+02:00'], { from: null, to: null })).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(periodMonths([], { from: '2026-10-01', to: '2026-10-24' })).toEqual(['2026-10']);
    expect(monthlySum([{ d: '2026-08-02', v: 2 }, { d: '2026-08-20', v: 3 }], ['2026-07', '2026-08'], (i) => i.d, (i) => i.v)).toEqual([0, 5]);
    expect(monthLabels(['2026-12', '2027-01'], (date) => date.slice(5, 7))).toEqual(['12 26', '01 27']);
  });

  it('splits monthly revenue by original currency using domain results', () => {
    const rows = rowsOf([trip({ id: 'a' }), trip({ id: 'b', revenue: { amount: 5_000, currency: 'MZN' } })]);
    const byCurrency = revenueByMonthAndCurrency(rows, ['2026-09']);
    expect(byCurrency.get('USD')).toEqual([63_900]);
    expect(byCurrency.get('MZN')).toEqual([5_000]);
  });

  it('excludes rejected expenses and splits approved and pending', () => {
    const expenses = expensesInPeriod(
      [
        expense(100),
        expense(40, { approvalStatus: 'pending' }),
        expense(999, { approvalStatus: 'rejected' }),
        expense(70, { date: '2026-01-01' }),
      ],
      { from: '2026-09-01', to: '2026-09-30' },
    );
    expect(expenses.length).toBe(2);
    const [tolls] = expensesByCategory(expenses, 'MZN');
    expect(tolls).toEqual({ category: 'tolls', count: 2, approved: 100, pending: 40, total: 140 });
    expect(expensesByMonth(expenses, ['2026-09'], 'MZN')).toEqual({ approved: [100], pending: [40] });
  });

  it('aggregates fuel by vehicle and by country/currency market', () => {
    const records = [
      fuel(),
      fuel({ id: 'f2', location: 'Harare', litres: 50, pricePerLitre: { amount: 1.5, currency: 'USD' }, totalAmount: { amount: 75, currency: 'USD' } }),
      fuel({ id: 'f3', location: 'Cassacatiza', litres: 100, totalAmount: { amount: 9_200, currency: 'MZN' } }),
    ];
    const [vehicle] = fuelByVehicle(records, 'MZN');
    expect(vehicle.litres).toBe(250);
    expect(vehicle.cost).toBe(9_000 + 4_792.5 + 9_200);
    const cities = cityCountries([], [trip()]);
    const markets = fuelByMarket(records, cities, 'MZN');
    const mz = markets.find((m) => m.country === 'MZ');
    // Unknown city falls back to the currency's home country.
    expect(mz?.records).toBe(2);
    expect(mz?.avgPriceOriginal).toBe(91);
    const zw = markets.find((m) => m.country === 'ZW');
    expect(zw?.avgPriceOriginal).toBe(1.5);
    expect(zw?.avgPriceReporting).toBe(95.85);
    expect(zw?.rate).toBe(63.9);
  });

  it('counts only completed maintenance in the period', () => {
    const records = maintenanceInPeriod(
      [maintenance(), maintenance({ id: 'm2', status: 'scheduled' }), maintenance({ id: 'm3', completedDate: '2026-01-01' })],
      { from: '2026-09-01', to: '2026-09-30' },
    );
    expect(records.length).toBe(1);
    expect(maintenanceByType(records, 'MZN')).toEqual([{ key: 'preventive', orders: 1, cost: 1_000, downtimeHours: 6 }]);
  });

  it('computes vehicle operating cost per km from fuel, expenses and maintenance', () => {
    const [row] = vehicleOperatingCosts(
      {
        vehicleIds: ['v1', 'v2'],
        fuel: [fuel()],
        expenses: [expense(1_000), expense(500, { approvalStatus: 'rejected' })],
        maintenance: [maintenance()],
        trips: [trip()],
      },
      'MZN',
    );
    expect(row).toEqual({ vehicleId: 'v1', trips: 1, distanceKm: 500, fuel: 9_000, expenses: 1_000, maintenance: 1_000, total: 11_000, costPerKm: 22 });
  });

  it('joins customer profitability with the demo outstanding balance', () => {
    const customer = { id: 'c1', outstandingBalance: { amount: 10, currency: 'USD' } } as Customer;
    const [row] = customerPerformance(rowsOf([trip()]), [customer], 'MZN');
    expect(row.trips).toBe(1);
    expect(row.revenue).toBe(63_900);
    expect(row.outstandingReporting).toBe(639);
  });

  it('measures route duration and delay', () => {
    const late = trip({
      id: 'late',
      actualDeparture: '2026-09-10T06:00:00+02:00',
      actualArrival: '2026-09-10T23:00:00+02:00',
    });
    expect(tripDurationHours(late)).toBe(17);
    const [route] = routePerformance(rowsOf([late, trip({ id: 'ok' })]), '2026-10-24T12:00:00+02:00');
    expect(route.key).toBe('Beira → Harare');
    expect(route.trips).toBe(2);
    expect(route.avgDelayHours).toBe(1.5);
    expect(route.onTimeRatio).toBe(0.5);
  });
});
