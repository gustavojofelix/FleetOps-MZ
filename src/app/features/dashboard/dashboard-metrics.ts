import { daysUntilExpiry, expiryStatus } from '../../core/domain/document-status';
import { FuelAnalysis } from '../../core/domain/fuel-analysis';
import { maintenanceDisplayStatus, maintenanceTotalCost } from '../../core/domain/maintenance-rules';
import { TripProfitability, costBucketOf, marginRatio } from '../../core/domain/profitability';
import { convertMoney } from '../../core/formatting/currency';
import { addDays, dateOfTimestamp, isWithinRange, monthKey } from '../../core/formatting/date-utils';
import {
  ACTIVE_TRIP_STATUSES,
  CurrencyCode,
  Driver,
  Expense,
  FINISHED_TRIP_STATUSES,
  FleetDocument,
  FuelRecord,
  IsoDate,
  MaintenanceDisplayStatus,
  MaintenanceRecord,
  Money,
  Trip,
  Vehicle,
} from '../../core/models';

/*
 * Executive dashboard aggregation rules (pure, unit-tested).
 *
 * Period attribution:
 *   trips        → plannedDeparture
 *   fuel         → timestamp
 *   expenses     → date (rejected expenses excluded)
 *   maintenance  → completedDate ?? plannedDate (completed work orders only count as cost)
 *
 * Revenue, direct costs and contribution margin come from finished trips (delivered + completed)
 * using the shared trip profitability (already in the reporting currency). Operating expenses are
 * every recorded cost in the period — fuel, non-rejected expenses and completed maintenance — so they
 * include costs not linked to a trip. Contribution margin is not net profit.
 */

export interface DateRange {
  from: IsoDate | null;
  to: IsoDate | null;
}

export type OperatingCostBucket = 'fuel' | 'tolls_fees' | 'driver_allowance' | 'maintenance' | 'other';
export const OPERATING_COST_BUCKETS: readonly OperatingCostBucket[] = ['fuel', 'tolls_fees', 'driver_allowance', 'maintenance', 'other'];

export interface DashboardSource {
  vehicles: readonly Vehicle[];
  drivers: readonly Driver[];
  trips: readonly Trip[];
  fuel: readonly FuelRecord[];
  expenses: readonly Expense[];
  maintenance: readonly MaintenanceRecord[];
  documents: readonly FleetDocument[];
  profitability: ReadonlyMap<string, TripProfitability>;
  fuelAnalysis: ReadonlyMap<string, FuelAnalysis>;
  reporting: CurrencyCode;
  today: IsoDate;
  expiryWarningDays: number;
}

// ---------------------------------------------------------------- helpers

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toReporting(money: Money, reporting: CurrencyCode): number {
  return convertMoney(money, reporting).converted.amount;
}

/** Date that attributes a maintenance record to a period. */
export function maintenanceDate(record: Pick<MaintenanceRecord, 'completedDate' | 'plannedDate'>): IsoDate {
  return record.completedDate ?? record.plannedDate;
}

export function isFinishedTrip(trip: Pick<Trip, 'status'>): boolean {
  return FINISHED_TRIP_STATUSES.includes(trip.status);
}

export function isActiveTrip(trip: Pick<Trip, 'status'>): boolean {
  return ACTIVE_TRIP_STATUSES.includes(trip.status);
}

/** Relative change; null when there is no meaningful baseline. */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** `count` month keys (YYYY-MM) ending with the month of `end`, oldest first. */
export function trailingMonths(end: IsoDate, count: number): string[] {
  const year = Number(end.slice(0, 4));
  const month = Number(end.slice(5, 7)) - 1;
  const result: string[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const date = new Date(Date.UTC(year, month - offset, 1));
    result.push(date.toISOString().slice(0, 7));
  }
  return result;
}

// ---------------------------------------------------------------- fleet

export interface FleetSnapshot {
  total: number;
  available: number;
  inTransit: number;
  operational: number;
  maintenance: number;
  inactive: number;
  /** Operational share of the fleet (0–1); null for an empty fleet. */
  operationalRatio: number | null;
}

export function fleetSnapshot(vehicles: readonly Vehicle[]): FleetSnapshot {
  const count = (status: Vehicle['status']) => vehicles.filter((vehicle) => vehicle.status === status).length;
  const available = count('available');
  const inTransit = count('in_transit');
  const operational = available + inTransit;
  return {
    total: vehicles.length,
    available,
    inTransit,
    operational,
    maintenance: count('maintenance'),
    inactive: count('inactive'),
    operationalRatio: vehicles.length ? operational / vehicles.length : null,
  };
}

// ---------------------------------------------------------------- period figures

export interface PeriodMetrics {
  finishedTrips: number;
  revenue: number;
  directCosts: number;
  contributionMargin: number;
  /** Ratio (0.25 = 25 %); null when revenue is zero. */
  marginRatio: number | null;
  operatingExpenses: number;
  costBreakdown: Record<OperatingCostBucket, number>;
  fuelLitres: number;
  fuelCost: number;
  maintenanceCost: number;
  /** Fuel readings in the period flagged for review. */
  fuelWarnings: number;
  /** True when any amount behind these figures was converted from another currency. */
  mixedCurrencies: boolean;
}

export function emptyOperatingBreakdown(): Record<OperatingCostBucket, number> {
  return { fuel: 0, tolls_fees: 0, driver_allowance: 0, maintenance: 0, other: 0 };
}

export function periodMetrics(source: DashboardSource, range: DateRange): PeriodMetrics {
  const { reporting } = source;
  const inRange = (value: string) => isWithinRange(value, range.from, range.to);
  let mixed = false;

  let finishedTrips = 0;
  let revenue = 0;
  let directCosts = 0;
  for (const trip of source.trips) {
    if (!isFinishedTrip(trip) || !inRange(trip.plannedDeparture)) continue;
    const result = source.profitability.get(trip.id);
    if (!result) continue;
    finishedTrips += 1;
    revenue += result.revenue;
    directCosts += result.totalDirectCosts;
    mixed ||= result.usesSimulatedConversion;
  }

  const breakdown = emptyOperatingBreakdown();
  let fuelLitres = 0;
  let fuelWarnings = 0;
  for (const record of source.fuel) {
    if (!inRange(record.timestamp)) continue;
    fuelLitres += record.litres;
    breakdown.fuel += toReporting(record.totalAmount, reporting);
    mixed ||= record.totalAmount.currency !== reporting;
    if (source.fuelAnalysis.get(record.id)?.warnings.length) fuelWarnings += 1;
  }
  for (const expense of source.expenses) {
    if (expense.approvalStatus === 'rejected' || !inRange(expense.date)) continue;
    breakdown[costBucketOf(expense.category)] += toReporting(expense.amount, reporting);
    mixed ||= expense.amount.currency !== reporting;
  }
  for (const record of source.maintenance) {
    if (record.status !== 'completed' || !inRange(maintenanceDate(record))) continue;
    breakdown.maintenance += toReporting({ amount: maintenanceTotalCost(record), currency: record.currency }, reporting);
    mixed ||= record.currency !== reporting;
  }
  for (const bucket of OPERATING_COST_BUCKETS) breakdown[bucket] = round2(breakdown[bucket]);

  const margin = round2(revenue - directCosts);
  return {
    finishedTrips,
    revenue: round2(revenue),
    directCosts: round2(directCosts),
    contributionMargin: margin,
    marginRatio: marginRatio(revenue, margin),
    operatingExpenses: round2(OPERATING_COST_BUCKETS.reduce((sum, bucket) => sum + breakdown[bucket], 0)),
    costBreakdown: breakdown,
    fuelLitres: round2(fuelLitres),
    fuelCost: breakdown.fuel,
    maintenanceCost: breakdown.maintenance,
    fuelWarnings,
    mixedCurrencies: mixed,
  };
}

// ---------------------------------------------------------------- monthly trends

export interface MonthlyPoint {
  month: string;
  revenue: number;
  directCosts: number;
  fuelLitres: number;
  fuelCost: number;
  maintenanceCost: number;
}

export function monthlyTrend(source: DashboardSource, months: readonly string[]): MonthlyPoint[] {
  const { reporting } = source;
  const points = new Map<string, MonthlyPoint>(
    months.map((month) => [month, { month, revenue: 0, directCosts: 0, fuelLitres: 0, fuelCost: 0, maintenanceCost: 0 }]),
  );
  for (const trip of source.trips) {
    if (!isFinishedTrip(trip)) continue;
    const point = points.get(monthKey(trip.plannedDeparture));
    const result = source.profitability.get(trip.id);
    if (!point || !result) continue;
    point.revenue += result.revenue;
    point.directCosts += result.totalDirectCosts;
  }
  for (const record of source.fuel) {
    const point = points.get(monthKey(record.timestamp));
    if (!point) continue;
    point.fuelLitres += record.litres;
    point.fuelCost += toReporting(record.totalAmount, reporting);
  }
  for (const record of source.maintenance) {
    if (record.status !== 'completed') continue;
    const point = points.get(monthKey(maintenanceDate(record)));
    if (!point) continue;
    point.maintenanceCost += toReporting({ amount: maintenanceTotalCost(record), currency: record.currency }, reporting);
  }
  return months.map((month) => {
    const point = points.get(month)!;
    return {
      month,
      revenue: round2(point.revenue),
      directCosts: round2(point.directCosts),
      fuelLitres: round2(point.fuelLitres),
      fuelCost: round2(point.fuelCost),
      maintenanceCost: round2(point.maintenanceCost),
    };
  });
}

// ---------------------------------------------------------------- operational lists

/**
 * Latest closed trips (delivered, completed or cancelled), newest first by arrival — active trips
 * have their own panel. Uses the actual arrival when known, else the planned one.
 */
export function recentTrips(trips: readonly Trip[], today: IsoDate, limit = 5): Trip[] {
  const closedAt = (trip: Trip) => trip.actualArrival ?? trip.plannedArrival;
  return trips
    .filter((trip) => (isFinishedTrip(trip) || trip.status === 'cancelled') && dateOfTimestamp(trip.plannedDeparture) <= today)
    .sort((a, b) => closedAt(b).localeCompare(closedAt(a)))
    .slice(0, limit);
}

/** Trips currently committing vehicles: delayed first, then by planned arrival. */
export function activeTrips(trips: readonly Trip[]): Trip[] {
  return trips
    .filter(isActiveTrip)
    .sort((a, b) => {
      const delayed = Number(b.status === 'delayed') - Number(a.status === 'delayed');
      return delayed || a.plannedArrival.localeCompare(b.plannedArrival);
    });
}

export interface UpcomingMaintenance {
  record: MaintenanceRecord;
  status: MaintenanceDisplayStatus;
  /** Days from today to the planned date (negative when overdue). */
  days: number;
}

/** Scheduled work orders (overdue first, then soonest), optionally limited to a horizon in days. */
export function upcomingMaintenance(records: readonly MaintenanceRecord[], today: IsoDate, horizonDays: number | null = null): UpcomingMaintenance[] {
  const horizon = horizonDays === null ? null : addDays(today, horizonDays);
  return records
    .filter((record) => record.status === 'scheduled' && (horizon === null || record.plannedDate <= horizon))
    .map((record) => ({
      record,
      status: maintenanceDisplayStatus(record, today),
      days: daysUntilExpiry(record.plannedDate, today) ?? 0,
    }))
    .sort((a, b) => a.record.plannedDate.localeCompare(b.record.plannedDate));
}

/** Documents already expired or expiring within the warning window, soonest expiry first. */
export function expiringDocuments(documents: readonly FleetDocument[], today: IsoDate, warningDays: number): FleetDocument[] {
  return documents
    .filter((document) => {
      const status = expiryStatus(document.expiryDate, today, warningDays);
      return status === 'expired' || status === 'expiring';
    })
    .sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''));
}

// ---------------------------------------------------------------- alerts

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertKind =
  | 'trip_delayed'
  | 'maintenance_overdue'
  | 'documents_expired'
  | 'documents_expiring'
  | 'licence_expired'
  | 'licence_expiring'
  | 'fuel_warnings'
  | 'expenses_pending';

export interface DashboardAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  /** Interpolation values for the translated message. */
  params: Record<string, string | number>;
  link: string | string[];
  queryParams?: Record<string, string>;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

export interface AlertContext {
  /** Number of fuel readings flagged in the selected period. */
  fuelWarnings: number;
  routeLabel: (trip: Trip) => string;
  driverName: (driver: Driver) => string;
}

/** Operational alerts derived from the data, most severe first. */
export function buildAlerts(source: DashboardSource, context: AlertContext): DashboardAlert[] {
  const { today, expiryWarningDays } = source;
  const alerts: DashboardAlert[] = [];

  for (const trip of source.trips.filter((t) => t.status === 'delayed')) {
    alerts.push({
      id: `trip-${trip.id}`,
      kind: 'trip_delayed',
      severity: 'critical',
      params: { reference: trip.reference, route: context.routeLabel(trip), reason: trip.delayReason ?? '' },
      link: ['/trips', trip.id],
    });
  }

  const overdue = source.maintenance.filter((record) => maintenanceDisplayStatus(record, today) === 'overdue').length;
  if (overdue) {
    alerts.push({ id: 'maintenance-overdue', kind: 'maintenance_overdue', severity: 'critical', params: { count: overdue }, link: '/maintenance', queryParams: { status: 'overdue' } });
  }

  const documentStatuses = source.documents.map((document) => expiryStatus(document.expiryDate, today, expiryWarningDays));
  const expired = documentStatuses.filter((status) => status === 'expired').length;
  const expiring = documentStatuses.filter((status) => status === 'expiring').length;
  if (expired) {
    alerts.push({ id: 'documents-expired', kind: 'documents_expired', severity: 'critical', params: { count: expired }, link: '/documents', queryParams: { status: 'expired' } });
  }
  if (expiring) {
    alerts.push({ id: 'documents-expiring', kind: 'documents_expiring', severity: 'warning', params: { count: expiring }, link: '/documents', queryParams: { status: 'expiring' } });
  }

  for (const driver of source.drivers) {
    if (driver.status === 'inactive') continue;
    const status = expiryStatus(driver.licenceExpiry, today, expiryWarningDays);
    if (status !== 'expired' && status !== 'expiring') continue;
    const days = daysUntilExpiry(driver.licenceExpiry, today) ?? 0;
    alerts.push({
      id: `licence-${driver.id}`,
      kind: status === 'expired' ? 'licence_expired' : 'licence_expiring',
      severity: status === 'expired' ? 'critical' : 'warning',
      params: { name: context.driverName(driver), count: Math.abs(days) },
      link: ['/drivers', driver.id],
    });
  }

  if (context.fuelWarnings) {
    alerts.push({ id: 'fuel-warnings', kind: 'fuel_warnings', severity: 'warning', params: { count: context.fuelWarnings }, link: '/fuel', queryParams: { warnings: '1' } });
  }

  const pending = source.expenses.filter((expense) => expense.approvalStatus === 'pending').length;
  if (pending) {
    alerts.push({ id: 'expenses-pending', kind: 'expenses_pending', severity: 'info', params: { count: pending }, link: '/expenses', queryParams: { approval: 'pending' } });
  }

  // Stable sort keeps the insertion order inside each severity.
  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
