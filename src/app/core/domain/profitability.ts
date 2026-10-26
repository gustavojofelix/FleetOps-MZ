import { CurrencyCode, Expense, ExpenseCategory, FuelRecord, MaintenanceRecord, Money, Trip, TripStatus } from '../models';
import { convertMoney, sumInCurrency } from '../formatting/currency';
import { maintenanceTotalCost } from './maintenance-rules';

/*
 * Trip profitability rules (mock phase).
 *
 *   Contribution margin   = trip revenue − recorded direct trip costs
 *   Contribution margin % = contribution margin / trip revenue × 100   (null when revenue is 0)
 *
 * Direct costs are fuel records and expenses linked to the trip. Rejected expenses are
 * excluded; pending ones are included (they are real, only not yet approved).
 * Maintenance is NOT a direct cost: it is shown separately as an estimated allocation
 * (vehicle maintenance cost per km × trip distance) and never changes the contribution margin.
 * Contribution margin is not net profit: taxes, overheads, salaries, depreciation and
 * financing are not included. All amounts are converted to the reporting currency with
 * the simulated rates in core/formatting/currency.ts.
 */

export type CostBucket = 'fuel' | 'tolls_fees' | 'driver_allowance' | 'other';

export const COST_BUCKETS: readonly CostBucket[] = ['fuel', 'tolls_fees', 'driver_allowance', 'other'];

const CATEGORY_BUCKET: Record<ExpenseCategory, CostBucket> = {
  tolls: 'tolls_fees',
  border_fees: 'tolls_fees',
  permits: 'tolls_fees',
  parking: 'tolls_fees',
  driver_allowance: 'driver_allowance',
  loading: 'other',
  repairs: 'other',
  tyres: 'other',
  insurance: 'other',
  fines: 'other',
  other: 'other',
};

export function costBucketOf(category: ExpenseCategory): CostBucket {
  return CATEGORY_BUCKET[category];
}

/** Trips whose costs are still accumulating; their margin is provisional. */
const IN_PROGRESS: readonly TripStatus[] = ['planned', 'preparing', 'in_transit', 'delayed'];

export interface TripProfitability {
  tripId: string;
  currency: CurrencyCode;
  revenue: number;
  /** Revenue in its original transaction currency. */
  revenueOriginal: Money;
  costs: Record<CostBucket, number>;
  totalDirectCosts: number;
  contributionMargin: number;
  /** Ratio (0.25 = 25 %); null when revenue is zero. */
  marginRatio: number | null;
  distanceKm: number;
  costPerKm: number | null;
  revenuePerKm: number | null;
  /** Estimated maintenance allocation; informational only, not in the margin. */
  maintenanceAllocation: number;
  provisional: boolean;
  usesSimulatedConversion: boolean;
}

export function contributionMargin(revenue: number, directCosts: number): number {
  return round2(revenue - directCosts);
}

/** Margin ratio with safe handling of zero (or missing) revenue. */
export function marginRatio(revenue: number, margin: number): number | null {
  if (!Number.isFinite(revenue) || revenue === 0) return null;
  return margin / revenue;
}

export function emptyCostBreakdown(): Record<CostBucket, number> {
  return { fuel: 0, tolls_fees: 0, driver_allowance: 0, other: 0 };
}

export interface ProfitabilityInputs {
  fuel: readonly FuelRecord[];
  expenses: readonly Expense[];
  /** Maintenance cost per km by vehicle id, in the reporting currency. */
  maintenanceCostPerKm?: ReadonlyMap<string, number>;
}

export function tripDistanceKm(trip: Pick<Trip, 'actualDistanceKm' | 'plannedDistanceKm'>): number {
  return trip.actualDistanceKm ?? trip.plannedDistanceKm ?? 0;
}

export function calculateTripProfitability(trip: Trip, inputs: ProfitabilityInputs, reporting: CurrencyCode): TripProfitability {
  const fuel = inputs.fuel.filter((record) => record.tripId === trip.id);
  const expenses = inputs.expenses.filter((expense) => expense.tripId === trip.id && expense.approvalStatus !== 'rejected');

  const costs = emptyCostBreakdown();
  costs.fuel = sumInCurrency(
    fuel.map((record) => record.totalAmount),
    reporting,
  );
  for (const expense of expenses) {
    const bucket = costBucketOf(expense.category);
    costs[bucket] = round2(costs[bucket] + convertMoney(expense.amount, reporting).converted.amount);
  }

  const revenue = trip.status === 'cancelled' ? 0 : convertMoney(trip.revenue, reporting).converted.amount;
  const totalDirectCosts = round2(COST_BUCKETS.reduce((sum, bucket) => sum + costs[bucket], 0));
  const margin = contributionMargin(revenue, totalDirectCosts);
  const distanceKm = tripDistanceKm(trip);
  const perKm = inputs.maintenanceCostPerKm?.get(trip.vehicleId) ?? 0;

  const usesSimulatedConversion =
    trip.revenue.currency !== reporting ||
    fuel.some((record) => record.totalAmount.currency !== reporting) ||
    expenses.some((expense) => expense.amount.currency !== reporting);

  return {
    tripId: trip.id,
    currency: reporting,
    revenue,
    revenueOriginal: { ...trip.revenue },
    costs,
    totalDirectCosts,
    contributionMargin: margin,
    marginRatio: marginRatio(revenue, margin),
    distanceKm,
    costPerKm: distanceKm > 0 ? round2(totalDirectCosts / distanceKm) : null,
    revenuePerKm: distanceKm > 0 ? round2(revenue / distanceKm) : null,
    maintenanceAllocation: round2(perKm * distanceKm),
    provisional: IN_PROGRESS.includes(trip.status),
    usesSimulatedConversion,
  };
}

/**
 * Maintenance cost per kilometre for each vehicle: completed work-order costs divided by the
 * kilometres driven on its trips in the same dataset. Vehicles without distance get 0.
 */
export function maintenanceCostPerKm(
  maintenance: readonly MaintenanceRecord[],
  trips: readonly Trip[],
  reporting: CurrencyCode,
): Map<string, number> {
  const costByVehicle = new Map<string, number>();
  for (const record of maintenance) {
    if (record.status !== 'completed') continue;
    const cost = convertMoney({ amount: maintenanceTotalCost(record), currency: record.currency }, reporting).converted.amount;
    costByVehicle.set(record.vehicleId, (costByVehicle.get(record.vehicleId) ?? 0) + cost);
  }
  const kmByVehicle = new Map<string, number>();
  for (const trip of trips) {
    if (trip.status !== 'completed' && trip.status !== 'delivered') continue;
    // Loaded leg plus the empty return leg.
    kmByVehicle.set(trip.vehicleId, (kmByVehicle.get(trip.vehicleId) ?? 0) + tripDistanceKm(trip) * 2);
  }
  const result = new Map<string, number>();
  costByVehicle.forEach((cost, vehicleId) => {
    const km = kmByVehicle.get(vehicleId) ?? 0;
    result.set(vehicleId, km > 0 ? cost / km : 0);
  });
  return result;
}

export interface ProfitabilityAggregate {
  key: string;
  trips: number;
  revenue: number;
  totalDirectCosts: number;
  contributionMargin: number;
  marginRatio: number | null;
  distanceKm: number;
  costPerKm: number | null;
  costs: Record<CostBucket, number>;
}

/** Groups trip results (e.g. by customer, vehicle or route) and recomputes ratios from totals. */
export function aggregateProfitability(
  rows: readonly { key: string; result: TripProfitability }[],
): ProfitabilityAggregate[] {
  const groups = new Map<string, ProfitabilityAggregate>();
  for (const { key, result } of rows) {
    const group = groups.get(key) ?? {
      key,
      trips: 0,
      revenue: 0,
      totalDirectCosts: 0,
      contributionMargin: 0,
      marginRatio: null,
      distanceKm: 0,
      costPerKm: null,
      costs: emptyCostBreakdown(),
    };
    group.trips += 1;
    group.revenue = round2(group.revenue + result.revenue);
    group.totalDirectCosts = round2(group.totalDirectCosts + result.totalDirectCosts);
    group.contributionMargin = round2(group.contributionMargin + result.contributionMargin);
    group.distanceKm += result.distanceKm;
    for (const bucket of COST_BUCKETS) group.costs[bucket] = round2(group.costs[bucket] + result.costs[bucket]);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    marginRatio: marginRatio(group.revenue, group.contributionMargin),
    costPerKm: group.distanceKm > 0 ? round2(group.totalDirectCosts / group.distanceKm) : null,
  }));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
