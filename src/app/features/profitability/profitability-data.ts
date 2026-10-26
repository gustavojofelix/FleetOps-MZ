import {
  COST_BUCKETS,
  CostBucket,
  ProfitabilityAggregate,
  TripProfitability,
  aggregateProfitability,
  emptyCostBreakdown,
} from '../../core/domain/profitability';
import { isWithinRange, monthKey, monthsInRange } from '../../core/formatting/date-utils';
import { ACTIVE_TRIP_STATUSES, FINISHED_TRIP_STATUSES, IsoDate, Trip, TripStatus } from '../../core/models';

/*
 * View-level aggregation for the profitability page and the financial reports.
 * Every figure is derived from the domain results (FleetAnalytics.tripProfitability()), so no
 * margin formula is repeated here: totals and groups go through aggregateProfitability().
 */

export type GroupBy = 'trip' | 'customer' | 'vehicle' | 'route';
export type Dimension = Exclude<GroupBy, 'trip'>;
export type StatusScope = 'finished' | 'provisional';

export const GROUP_BYS: readonly GroupBy[] = ['trip', 'customer', 'vehicle', 'route'];
export const DIMENSIONS: readonly Dimension[] = ['customer', 'vehicle', 'route'];
export const STATUS_SCOPES: readonly StatusScope[] = ['finished', 'provisional'];

type ChartSlot = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Fixed chart colour slot per measure, shared by the profitability page and every report so
 * the same measure always has the same colour.
 */
export const MEASURE_COLORS = {
  revenue: 1,
  directCosts: 2,
  fuel: 3,
  tolls_fees: 4,
  driver_allowance: 5,
  other: 2,
  maintenance: 6,
  pending: 4,
} as const satisfies Record<string, ChartSlot>;

export const BUCKET_COLORS: Readonly<Record<CostBucket, ChartSlot>> = {
  fuel: MEASURE_COLORS.fuel,
  tolls_fees: MEASURE_COLORS.tolls_fees,
  driver_allowance: MEASURE_COLORS.driver_allowance,
  other: MEASURE_COLORS.other,
};

export interface TripRow {
  trip: Trip;
  result: TripProfitability;
  /** YYYY-MM of the planned departure. */
  month: string;
}

export interface ProfitabilityGroup extends ProfitabilityAggregate {
  revenuePerKm: number | null;
  /** Estimated; informational only, never part of the margin. */
  maintenanceAllocation: number;
  provisionalTrips: number;
}

export interface MonthlyProfitability {
  months: string[];
  revenue: number[];
  directCosts: number[];
  margin: number[];
  buckets: Record<CostBucket, number[]>;
}

export type MarginTone = 'danger' | 'warning' | 'success' | 'neutral';

/** Healthy-margin threshold used for badge tones (ratio). */
export const LOW_MARGIN_THRESHOLD = 0.2;

export function scopeStatuses(scope: StatusScope): readonly TripStatus[] {
  return scope === 'finished' ? FINISHED_TRIP_STATUSES : [...FINISHED_TRIP_STATUSES, ...ACTIVE_TRIP_STATUSES];
}

/** Trips in scope whose planned departure falls in the period, joined with their results. */
export function selectTripRows(
  trips: readonly Trip[],
  results: ReadonlyMap<string, TripProfitability>,
  options: { from: IsoDate | null; to: IsoDate | null; scope: StatusScope },
): TripRow[] {
  const statuses = scopeStatuses(options.scope);
  const rows: TripRow[] = [];
  for (const trip of trips) {
    if (!statuses.includes(trip.status)) continue;
    if (!isWithinRange(trip.plannedDeparture, options.from, options.to)) continue;
    const result = results.get(trip.id);
    if (!result) continue;
    rows.push({ trip, result, month: monthKey(trip.plannedDeparture) });
  }
  return rows;
}

/** "Beira → Tete" — the route grouping key. */
export function routeKey(trip: Pick<Trip, 'origin' | 'destination'>): string {
  return `${trip.origin.city} → ${trip.destination.city}`;
}

export function groupKeyOf(trip: Trip, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'trip':
      return trip.id;
    case 'customer':
      return trip.customerId;
    case 'vehicle':
      return trip.vehicleId;
    case 'route':
      return routeKey(trip);
  }
}

function enrich(aggregate: ProfitabilityAggregate, rows: readonly TripRow[]): ProfitabilityGroup {
  return {
    ...aggregate,
    revenuePerKm: aggregate.distanceKm > 0 ? round2(aggregate.revenue / aggregate.distanceKm) : null,
    maintenanceAllocation: round2(rows.reduce((sum, row) => sum + row.result.maintenanceAllocation, 0)),
    provisionalTrips: rows.filter((row) => row.result.provisional).length,
  };
}

/** Groups trip rows by customer, vehicle or route using the domain aggregation. */
export function groupRows(rows: readonly TripRow[], dimension: Dimension): ProfitabilityGroup[] {
  const byKey = new Map<string, TripRow[]>();
  for (const row of rows) {
    const key = groupKeyOf(row.trip, dimension);
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }
  return aggregateProfitability(rows.map((row) => ({ key: groupKeyOf(row.trip, dimension), result: row.result }))).map((aggregate) =>
    enrich(aggregate, byKey.get(aggregate.key) ?? []),
  );
}

/** Totals for a set of trips (one group containing everything). */
export function totalsOf(rows: readonly TripRow[]): ProfitabilityGroup {
  const [aggregate] = aggregateProfitability(rows.map((row) => ({ key: 'all', result: row.result })));
  return enrich(
    aggregate ?? {
      key: 'all',
      trips: 0,
      revenue: 0,
      totalDirectCosts: 0,
      contributionMargin: 0,
      marginRatio: null,
      distanceKm: 0,
      costPerKm: null,
      costs: emptyCostBreakdown(),
    },
    rows,
  );
}

/** Month keys to chart: the period bounds, or the span of the data for open periods. */
export function chartMonths(rows: readonly TripRow[], from: IsoDate | null, to: IsoDate | null): string[] {
  const months = rows.map((row) => row.month).sort();
  const start = from ?? (months.length ? `${months[0]}-01` : null);
  const end = to ?? (months.length ? `${months[months.length - 1]}-01` : null);
  if (!start || !end) return [];
  return monthsInRange(start, end);
}

/** Revenue, direct costs, margin and cost buckets per month (reporting currency). */
export function monthlyProfitability(rows: readonly TripRow[], months: readonly string[]): MonthlyProfitability {
  const index = new Map(months.map((month, i) => [month, i]));
  const zeros = () => months.map(() => 0);
  const result: MonthlyProfitability = {
    months: [...months],
    revenue: zeros(),
    directCosts: zeros(),
    margin: zeros(),
    buckets: { fuel: zeros(), tolls_fees: zeros(), driver_allowance: zeros(), other: zeros() },
  };
  for (const row of rows) {
    const i = index.get(row.month);
    if (i === undefined) continue;
    result.revenue[i] = round2(result.revenue[i] + row.result.revenue);
    result.directCosts[i] = round2(result.directCosts[i] + row.result.totalDirectCosts);
    result.margin[i] = round2(result.margin[i] + row.result.contributionMargin);
    for (const bucket of COST_BUCKETS) result.buckets[bucket][i] = round2(result.buckets[bucket][i] + row.result.costs[bucket]);
  }
  return result;
}

/** Highest margin first; groups without revenue (no ratio) last. */
export function rankByMargin<T extends { marginRatio: number | null; revenue: number }>(groups: readonly T[]): T[] {
  return [...groups].sort((a, b) => {
    if (a.marginRatio === null && b.marginRatio === null) return b.revenue - a.revenue;
    if (a.marginRatio === null) return 1;
    if (b.marginRatio === null) return -1;
    return b.marginRatio - a.marginRatio || b.revenue - a.revenue;
  });
}

/** Best and worst performer by margin %; `worst` is null when only one group is comparable. */
export function bestAndWorst<T extends { key: string; marginRatio: number | null; revenue: number }>(
  groups: readonly T[],
): { best: T | null; worst: T | null } {
  const ranked = rankByMargin(groups).filter((group) => group.marginRatio !== null);
  if (!ranked.length) return { best: null, worst: null };
  const best = ranked[0];
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;
  return { best, worst };
}

export function marginTone(ratio: number | null | undefined): MarginTone {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return 'neutral';
  if (ratio < 0) return 'danger';
  if (ratio < LOW_MARGIN_THRESHOLD) return 'warning';
  return 'success';
}

/** Translation suffix describing a margin tone in words (status is never colour-only). */
export function marginToneLabel(tone: MarginTone): 'negative' | 'low' | 'healthy' | 'none' {
  switch (tone) {
    case 'danger':
      return 'negative';
    case 'warning':
      return 'low';
    case 'success':
      return 'healthy';
    default:
      return 'none';
  }
}

export type SortDirection = 'asc' | 'desc';

/** Stable sort by a numeric or text accessor; null values always go last. */
export function sortBy<T>(items: readonly T[], accessor: (item: T) => number | string | null | undefined, direction: SortDirection): T[] {
  const factor = direction === 'asc' ? 1 : -1;
  return items
    .map((item, index) => ({ item, index, value: accessor(item) }))
    .sort((a, b) => {
      const av = a.value;
      const bv = b.value;
      const aMissing = av === null || av === undefined || (typeof av === 'number' && Number.isNaN(av));
      const bMissing = bv === null || bv === undefined || (typeof bv === 'number' && Number.isNaN(bv));
      if (aMissing && bMissing) return a.index - b.index;
      if (aMissing) return 1;
      if (bMissing) return -1;
      const compared = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return compared * factor || a.index - b.index;
    })
    .map((entry) => entry.item);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
