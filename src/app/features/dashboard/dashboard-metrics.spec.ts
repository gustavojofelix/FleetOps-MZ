import { analyseFuelRecords } from '../../core/domain/fuel-analysis';
import { calculateTripProfitability } from '../../core/domain/profitability';
import { Driver, Expense, FleetDocument, FuelRecord, MaintenanceRecord, Trip, Vehicle } from '../../core/models';
import {
  DashboardSource,
  activeTrips,
  buildAlerts,
  expiringDocuments,
  fleetSnapshot,
  monthlyTrend,
  percentChange,
  periodMetrics,
  recentTrips,
  trailingMonths,
  upcomingMaintenance,
} from './dashboard-metrics';

const TODAY = '2026-10-24';
const stamps = { organizationId: 'org', createdAt: '', updatedAt: '' };

function vehicle(id: string, status: Vehicle['status']): Vehicle {
  return {
    ...stamps,
    id,
    plateNumber: id.toUpperCase(),
    fleetNumber: id,
    make: 'Scania',
    model: 'R460',
    year: 2020,
    type: 'truck_tractor',
    status,
    fuelType: 'diesel',
    vin: '',
    odometerKm: 100_000,
    tankCapacityL: 600,
    expectedConsumptionL100km: 35,
    payloadTonnes: 30,
    assignedDriverId: null,
    linkedTrailerId: null,
    acquisitionDate: '2020-01-01',
    notes: '',
    statusHistory: [],
  };
}

function trip(overrides: Partial<Trip>): Trip {
  return {
    ...stamps,
    id: 't1',
    reference: 'VG-1',
    customerId: 'c1',
    vehicleId: 'v1',
    driverId: 'd1',
    trailerId: null,
    routeId: null,
    origin: { city: 'Beira', country: 'MZ', site: '' },
    destination: { city: 'Tete', country: 'MZ', site: '' },
    plannedDistanceKm: 600,
    actualDistanceKm: null,
    cargo: { type: 'general', description: '', weightTonnes: 20, containerRef: null, sealNumber: null },
    plannedDeparture: '2026-10-10T06:00:00+02:00',
    plannedArrival: '2026-10-11T18:00:00+02:00',
    actualDeparture: null,
    actualArrival: null,
    status: 'completed',
    revenue: { amount: 100_000, currency: 'MZN' },
    customerReference: '',
    delayReason: null,
    notes: '',
    timeline: [],
    ...overrides,
  };
}

function fuel(overrides: Partial<FuelRecord>): FuelRecord {
  return {
    ...stamps,
    id: 'f1',
    reference: 'CB-1',
    timestamp: '2026-10-10T08:00:00+02:00',
    vehicleId: 'v1',
    driverId: null,
    tripId: 't1',
    odometerKm: 100_000,
    litres: 200,
    pricePerLitre: { amount: 100, currency: 'MZN' },
    totalAmount: { amount: 20_000, currency: 'MZN' },
    fullTank: true,
    station: '',
    location: '',
    receiptFileName: null,
    notes: '',
    ...overrides,
  };
}

function expense(overrides: Partial<Expense>): Expense {
  return {
    ...stamps,
    id: 'e1',
    reference: 'DP-1',
    date: '2026-10-10',
    category: 'tolls',
    amount: { amount: 5_000, currency: 'MZN' },
    vehicleId: 'v1',
    tripId: 't1',
    driverId: null,
    vendor: '',
    description: '',
    paymentMethod: 'cash',
    approvalStatus: 'approved',
    submittedByUserId: 'u1',
    receiptFileName: null,
    notes: '',
    ...overrides,
  };
}

function maintenance(overrides: Partial<MaintenanceRecord>): MaintenanceRecord {
  return {
    ...stamps,
    id: 'm1',
    workOrderNumber: 'OT-1',
    vehicleId: 'v1',
    type: 'preventive',
    status: 'completed',
    description: '',
    workshop: '',
    odometerKm: 100_000,
    plannedDate: '2026-10-05',
    startedDate: null,
    completedDate: '2026-10-06',
    currency: 'MZN',
    partsCost: 8_000,
    labourCost: 2_000,
    downtimeHours: 4,
    nextServiceKm: null,
    nextServiceDate: null,
    notes: '',
    ...overrides,
  };
}

function documentOf(id: string, expiryDate: string | null): FleetDocument {
  return {
    ...stamps,
    id,
    reference: id,
    type: 'insurance',
    title: id,
    entityType: 'vehicle',
    entityId: 'v1',
    issuer: '',
    issueDate: '2025-01-01',
    expiryDate,
    fileName: null,
    fileSizeKb: null,
    notes: '',
  };
}

function driver(id: string, licenceExpiry: string): Driver {
  return {
    ...stamps,
    id,
    employeeNumber: id,
    firstName: 'Ana',
    lastName: 'Sitoe',
    phone: '',
    email: '',
    city: 'Beira',
    nationalId: '',
    licenceNumber: '',
    licenceCategory: 'C+E',
    licenceExpiry,
    crossBorderAuthorized: true,
    hireDate: '2020-01-01',
    status: 'active',
    assignedVehicleId: null,
    emergencyContactName: '',
    emergencyContactPhone: '',
    incidents: [],
    notes: '',
  };
}

function source(parts: Partial<DashboardSource>): DashboardSource {
  const base = {
    vehicles: [] as Vehicle[],
    drivers: [] as Driver[],
    trips: [] as Trip[],
    fuel: [] as FuelRecord[],
    expenses: [] as Expense[],
    maintenance: [] as MaintenanceRecord[],
    documents: [] as FleetDocument[],
    reporting: 'MZN' as const,
    today: TODAY,
    expiryWarningDays: 30,
    ...parts,
  };
  const profitability =
    parts.profitability ??
    new Map(base.trips.map((t) => [t.id, calculateTripProfitability(t, { fuel: base.fuel, expenses: base.expenses }, base.reporting)]));
  const fuelAnalysis = parts.fuelAnalysis ?? analyseFuelRecords(base.fuel, base.vehicles);
  return { ...base, profitability, fuelAnalysis };
}

describe('dashboard metrics', () => {
  it('summarises fleet status', () => {
    const snapshot = fleetSnapshot([vehicle('a', 'available'), vehicle('b', 'in_transit'), vehicle('c', 'maintenance'), vehicle('d', 'inactive')]);
    expect(snapshot).toMatchObject({ total: 4, operational: 2, maintenance: 1, inactive: 1, operationalRatio: 0.5 });
    expect(fleetSnapshot([]).operationalRatio).toBeNull();
  });

  it('computes period revenue, margin and operating expenses', () => {
    const data = source({
      vehicles: [vehicle('v1', 'available')],
      trips: [
        trip({ id: 't1' }),
        trip({ id: 't2', status: 'in_transit', revenue: { amount: 50_000, currency: 'MZN' } }),
        trip({ id: 't3', plannedDeparture: '2026-08-01T06:00:00+02:00' }),
      ],
      fuel: [fuel({}), fuel({ id: 'f2', tripId: 't3', timestamp: '2026-08-01T08:00:00+02:00', odometerKm: 90_000 })],
      expenses: [
        expense({}),
        expense({ id: 'e2', category: 'driver_allowance', amount: { amount: 3_000, currency: 'MZN' }, approvalStatus: 'pending' }),
        expense({ id: 'e3', amount: { amount: 9_999, currency: 'MZN' }, approvalStatus: 'rejected' }),
      ],
      maintenance: [maintenance({}), maintenance({ id: 'm2', status: 'scheduled', completedDate: null, plannedDate: '2026-10-20' })],
    });

    const metrics = periodMetrics(data, { from: '2026-09-25', to: TODAY });
    expect(metrics.finishedTrips).toBe(1);
    expect(metrics.revenue).toBe(100_000);
    // Direct costs of t1: fuel 20 000 + tolls 5 000 + allowance 3 000 (pending counts, rejected does not).
    expect(metrics.directCosts).toBe(28_000);
    expect(metrics.contributionMargin).toBe(72_000);
    expect(metrics.marginRatio).toBeCloseTo(0.72);
    expect(metrics.costBreakdown).toEqual({ fuel: 20_000, tolls_fees: 5_000, driver_allowance: 3_000, maintenance: 10_000, other: 0 });
    expect(metrics.operatingExpenses).toBe(38_000);
    expect(metrics.fuelLitres).toBe(200);
    expect(metrics.mixedCurrencies).toBe(false);
  });

  it('converts foreign-currency amounts and flags the mix', () => {
    const data = source({ trips: [trip({ revenue: { amount: 1_000, currency: 'USD' } })] });
    const metrics = periodMetrics(data, { from: null, to: null });
    expect(metrics.revenue).toBeCloseTo(63_900);
    expect(metrics.mixedCurrencies).toBe(true);
  });

  it('handles an empty period without dividing by zero', () => {
    const metrics = periodMetrics(source({}), { from: '2026-09-25', to: TODAY });
    expect(metrics.revenue).toBe(0);
    expect(metrics.marginRatio).toBeNull();
    expect(metrics.operatingExpenses).toBe(0);
  });

  it('computes relative change only with a baseline', () => {
    expect(percentChange(120, 100)).toBeCloseTo(0.2);
    expect(percentChange(80, 100)).toBeCloseTo(-0.2);
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(10, null)).toBeNull();
  });

  it('lists trailing months across a year boundary', () => {
    expect(trailingMonths('2026-10-24', 6)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(trailingMonths('2026-02-10', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });

  it('groups monthly revenue, fuel and maintenance', () => {
    const data = source({
      trips: [trip({ id: 't1' }), trip({ id: 't2', plannedDeparture: '2026-09-15T06:00:00+02:00' })],
      fuel: [fuel({})],
      maintenance: [maintenance({}), maintenance({ id: 'm2', completedDate: '2026-09-02', partsCost: 1_000, labourCost: 0 })],
    });
    const [september, october] = monthlyTrend(data, ['2026-09', '2026-10']);
    expect(september).toMatchObject({ revenue: 100_000, directCosts: 0, fuelLitres: 0, maintenanceCost: 1_000 });
    expect(october).toMatchObject({ revenue: 100_000, directCosts: 20_000, fuelLitres: 200, fuelCost: 20_000, maintenanceCost: 10_000 });
  });

  it('orders operational lists', () => {
    const trips = [
      trip({ id: 'a', status: 'in_transit', plannedArrival: '2026-10-25T10:00:00+02:00', plannedDeparture: '2026-10-23T06:00:00+02:00' }),
      trip({ id: 'b', status: 'delayed', plannedArrival: '2026-10-26T10:00:00+02:00', plannedDeparture: '2026-10-22T06:00:00+02:00' }),
      trip({ id: 'c', status: 'planned', plannedDeparture: '2026-11-01T06:00:00+02:00' }),
      trip({ id: 'd', status: 'completed', plannedDeparture: '2026-10-01T06:00:00+02:00', actualArrival: '2026-10-03T12:00:00+02:00' }),
      trip({ id: 'e', status: 'cancelled', plannedDeparture: '2026-10-05T06:00:00+02:00', plannedArrival: '2026-10-06T12:00:00+02:00' }),
    ];
    expect(activeTrips(trips).map((t) => t.id)).toEqual(['b', 'a']);
    expect(recentTrips(trips, TODAY).map((t) => t.id)).toEqual(['e', 'd']);

    const upcoming = upcomingMaintenance(
      [
        maintenance({ id: 'later', status: 'scheduled', completedDate: null, plannedDate: '2026-11-02' }),
        maintenance({ id: 'late', status: 'scheduled', completedDate: null, plannedDate: '2026-10-20' }),
        maintenance({ id: 'done' }),
      ],
      TODAY,
    );
    expect(upcoming.map((u) => [u.record.id, u.status, u.days])).toEqual([
      ['late', 'overdue', -4],
      ['later', 'scheduled', 9],
    ]);

    const documents = expiringDocuments(
      [documentOf('ok', '2027-06-01'), documentOf('soon', '2026-11-10'), documentOf('gone', '2026-10-01'), documentOf('none', null)],
      TODAY,
      30,
    );
    expect(documents.map((d) => d.id)).toEqual(['gone', 'soon']);
  });

  it('builds alerts from the data, most severe first', () => {
    const data = source({
      trips: [trip({ id: 'd', reference: 'VG-9', status: 'delayed', delayReason: 'Fronteira' })],
      expenses: [expense({ approvalStatus: 'pending' }), expense({ id: 'e2', approvalStatus: 'pending' })],
      maintenance: [maintenance({ status: 'scheduled', completedDate: null, plannedDate: '2026-10-01' })],
      documents: [documentOf('soon', '2026-11-01')],
      drivers: [driver('d1', '2026-10-30'), driver('d2', '2028-01-01')],
    });
    const alerts = buildAlerts(data, { fuelWarnings: 2, routeLabel: (t) => `${t.origin.city} → ${t.destination.city}`, driverName: (d) => d.firstName });
    expect(alerts.map((a) => a.kind)).toEqual([
      'trip_delayed',
      'maintenance_overdue',
      'documents_expiring',
      'licence_expiring',
      'fuel_warnings',
      'expenses_pending',
    ]);
    expect(alerts[0]).toMatchObject({ link: ['/trips', 'd'], params: { reference: 'VG-9', route: 'Beira → Tete', reason: 'Fronteira' } });
    expect(alerts.find((a) => a.kind === 'expenses_pending')).toMatchObject({ params: { count: 2 }, queryParams: { approval: 'pending' } });
    expect(alerts.find((a) => a.kind === 'licence_expiring')?.params).toMatchObject({ count: 6 });
  });
});
