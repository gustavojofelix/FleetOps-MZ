import { maintenanceTotalCost } from '../../core/domain/maintenance-rules';
import { tripDistanceKm } from '../../core/domain/profitability';
import { delayHours } from '../../core/domain/trip-rules';
import { convertMoney, exchangeRate } from '../../core/formatting/currency';
import { hoursBetween, isWithinRange, monthKey, monthsInRange } from '../../core/formatting/date-utils';
import {
  CurrencyCode,
  Customer,
  Expense,
  ExpenseCategory,
  FuelRecord,
  IsoDate,
  IsoDateTime,
  MaintenanceRecord,
  MaintenanceType,
  Money,
  RouteDefinition,
  Trip,
} from '../../core/models';
import { ProfitabilityGroup, TripRow, groupRows, round2, routeKey } from '../profitability/profitability-data';

/*
 * Pure aggregations behind the financial reports. Amounts are converted to the reporting
 * currency with the same simulated rates as the rest of the app (core/formatting/currency);
 * trip figures come from the domain profitability results, never from a second formula.
 */

export interface Period {
  from: IsoDate | null;
  to: IsoDate | null;
}

export interface CurrencyTotal {
  currency: CurrencyCode;
  count: number;
  /** Sum in the original currency. */
  original: number;
  /** Sum converted to the reporting currency. */
  reporting: number;
  /** Simulated rate used (1 unit of `currency` in the reporting currency). */
  rate: number;
}

const toReporting = (money: Money, reporting: CurrencyCode): number => convertMoney(money, reporting).converted.amount;

/** Original totals per currency plus their converted value; largest converted total first. */
export function totalsByCurrency(amounts: readonly Money[], reporting: CurrencyCode): CurrencyTotal[] {
  const map = new Map<CurrencyCode, CurrencyTotal>();
  for (const money of amounts) {
    const entry = map.get(money.currency) ?? {
      currency: money.currency,
      count: 0,
      original: 0,
      reporting: 0,
      rate: exchangeRate(money.currency, reporting).rate,
    };
    entry.count += 1;
    entry.original = round2(entry.original + money.amount);
    entry.reporting = round2(entry.reporting + toReporting(money, reporting));
    map.set(money.currency, entry);
  }
  return [...map.values()].sort((a, b) => b.reporting - a.reporting);
}

/** Month keys covering the period, or the span of the given dates when the period is open. */
export function periodMonths(dates: readonly string[], period: Period): string[] {
  const months = dates.map((date) => monthKey(date)).sort();
  const from = period.from ?? (months.length ? `${months[0]}-01` : null);
  const to = period.to ?? (months.length ? `${months[months.length - 1]}-01` : null);
  return from && to ? monthsInRange(from, to) : [];
}

/** Sums values into month buckets aligned with `months`. */
export function monthlySum<T>(items: readonly T[], months: readonly string[], dateOf: (item: T) => string, valueOf: (item: T) => number): number[] {
  const index = new Map(months.map((month, i) => [month, i]));
  const values = months.map(() => 0);
  for (const item of items) {
    const i = index.get(monthKey(dateOf(item)));
    if (i !== undefined) values[i] = round2(values[i] + valueOf(item));
  }
  return values;
}

/** Short month labels; adds a 2-digit year when the range spans several years. */
export function monthLabels(months: readonly string[], formatMonth: (isoDate: string) => string): string[] {
  const multiYear = new Set(months.map((month) => month.slice(0, 4))).size > 1;
  return months.map((month) => {
    const label = formatMonth(`${month}-01`);
    return multiYear ? `${label} ${month.slice(2, 4)}` : label;
  });
}

// ---- Revenue -----------------------------------------------------------------------------

/** Revenue per month split by original currency (converted to reporting). */
export function revenueByMonthAndCurrency(rows: readonly TripRow[], months: readonly string[]): Map<CurrencyCode, number[]> {
  const result = new Map<CurrencyCode, number[]>();
  const index = new Map(months.map((month, i) => [month, i]));
  for (const row of rows) {
    const i = index.get(row.month);
    if (i === undefined) continue;
    const currency = row.trip.revenue.currency;
    const values = result.get(currency) ?? months.map(() => 0);
    values[i] = round2(values[i] + row.result.revenue);
    result.set(currency, values);
  }
  return result;
}

// ---- Expenses ----------------------------------------------------------------------------

/** Non-rejected expenses dated in the period (pending ones are real costs awaiting approval). */
export function expensesInPeriod(expenses: readonly Expense[], period: Period): Expense[] {
  return expenses.filter((expense) => expense.approvalStatus !== 'rejected' && isWithinRange(expense.date, period.from, period.to));
}

export interface ExpenseCategoryRow {
  category: ExpenseCategory;
  count: number;
  approved: number;
  pending: number;
  total: number;
}

export function expensesByCategory(expenses: readonly Expense[], reporting: CurrencyCode): ExpenseCategoryRow[] {
  const map = new Map<ExpenseCategory, ExpenseCategoryRow>();
  for (const expense of expenses) {
    const row = map.get(expense.category) ?? { category: expense.category, count: 0, approved: 0, pending: 0, total: 0 };
    const amount = toReporting(expense.amount, reporting);
    row.count += 1;
    if (expense.approvalStatus === 'approved') row.approved = round2(row.approved + amount);
    else if (expense.approvalStatus === 'pending') row.pending = round2(row.pending + amount);
    row.total = round2(row.approved + row.pending);
    map.set(expense.category, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function expensesByMonth(expenses: readonly Expense[], months: readonly string[], reporting: CurrencyCode): { approved: number[]; pending: number[] } {
  return {
    approved: monthlySum(
      expenses.filter((e) => e.approvalStatus === 'approved'),
      months,
      (e) => e.date,
      (e) => toReporting(e.amount, reporting),
    ),
    pending: monthlySum(
      expenses.filter((e) => e.approvalStatus === 'pending'),
      months,
      (e) => e.date,
      (e) => toReporting(e.amount, reporting),
    ),
  };
}

// ---- Fuel --------------------------------------------------------------------------------

export function fuelInPeriod(records: readonly FuelRecord[], period: Period): FuelRecord[] {
  return records.filter((record) => isWithinRange(record.timestamp, period.from, period.to));
}

export interface FuelVehicleRow {
  vehicleId: string;
  records: number;
  litres: number;
  cost: number;
  /** Reporting currency per litre; null without litres. */
  pricePerLitre: number | null;
}

export function fuelByVehicle(records: readonly FuelRecord[], reporting: CurrencyCode): FuelVehicleRow[] {
  const map = new Map<string, FuelVehicleRow>();
  for (const record of records) {
    const row = map.get(record.vehicleId) ?? { vehicleId: record.vehicleId, records: 0, litres: 0, cost: 0, pricePerLitre: null };
    row.records += 1;
    row.litres = round2(row.litres + record.litres);
    row.cost = round2(row.cost + toReporting(record.totalAmount, reporting));
    map.set(record.vehicleId, row);
  }
  return [...map.values()]
    .map((row) => ({ ...row, pricePerLitre: row.litres > 0 ? round2(row.cost / row.litres) : null }))
    .sort((a, b) => b.cost - a.cost);
}

const CURRENCY_HOME: Partial<Record<CurrencyCode, string>> = { MZN: 'MZ', ZAR: 'ZA' };

/** City → country from the route catalogue and trip locations. */
export function cityCountries(routes: readonly RouteDefinition[], trips: readonly Trip[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const location of [...routes.flatMap((r) => [r.origin, r.destination]), ...trips.flatMap((t) => [t.origin, t.destination])]) {
    if (location.city && location.country) map.set(location.city, location.country);
  }
  return map;
}

/** Country of a fuel purchase: its location city when known, else the currency's home country. */
export function fuelCountry(record: FuelRecord, cities: ReadonlyMap<string, string>): string | null {
  return cities.get(record.location) ?? CURRENCY_HOME[record.totalAmount.currency] ?? null;
}

export interface FuelMarketRow {
  country: string | null;
  currency: CurrencyCode;
  records: number;
  litres: number;
  /** Sum in the purchase currency. */
  original: number;
  /** Average price per litre in the purchase currency. */
  avgPriceOriginal: number | null;
  reporting: number;
  avgPriceReporting: number | null;
  rate: number;
}

/** Average price per litre by country and purchase currency. */
export function fuelByMarket(records: readonly FuelRecord[], cities: ReadonlyMap<string, string>, reporting: CurrencyCode): FuelMarketRow[] {
  const map = new Map<string, FuelMarketRow>();
  for (const record of records) {
    const country = fuelCountry(record, cities);
    const currency = record.totalAmount.currency;
    const key = `${country ?? '?'}|${currency}`;
    const row = map.get(key) ?? {
      country,
      currency,
      records: 0,
      litres: 0,
      original: 0,
      avgPriceOriginal: null,
      reporting: 0,
      avgPriceReporting: null,
      rate: exchangeRate(currency, reporting).rate,
    };
    row.records += 1;
    row.litres = round2(row.litres + record.litres);
    row.original = round2(row.original + record.totalAmount.amount);
    row.reporting = round2(row.reporting + toReporting(record.totalAmount, reporting));
    map.set(key, row);
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      avgPriceOriginal: row.litres > 0 ? round2(row.original / row.litres) : null,
      avgPriceReporting: row.litres > 0 ? round2(row.reporting / row.litres) : null,
    }))
    .sort((a, b) => b.litres - a.litres);
}

// ---- Maintenance -------------------------------------------------------------------------

/** Completed work orders whose completion (or planned) date falls in the period. */
export function maintenanceInPeriod(records: readonly MaintenanceRecord[], period: Period): MaintenanceRecord[] {
  return records.filter((record) => record.status === 'completed' && isWithinRange(maintenanceDate(record), period.from, period.to));
}

export function maintenanceDate(record: MaintenanceRecord): IsoDate {
  return record.completedDate ?? record.plannedDate;
}

export function maintenanceCost(record: MaintenanceRecord, reporting: CurrencyCode): number {
  return toReporting({ amount: maintenanceTotalCost(record), currency: record.currency }, reporting);
}

export interface MaintenanceGroupRow<K extends string> {
  key: K;
  orders: number;
  cost: number;
  downtimeHours: number;
}

export function maintenanceBy<K extends string>(
  records: readonly MaintenanceRecord[],
  keyOf: (record: MaintenanceRecord) => K,
  reporting: CurrencyCode,
): MaintenanceGroupRow<K>[] {
  const map = new Map<K, MaintenanceGroupRow<K>>();
  for (const record of records) {
    const key = keyOf(record);
    const row = map.get(key) ?? { key, orders: 0, cost: 0, downtimeHours: 0 };
    row.orders += 1;
    row.cost = round2(row.cost + maintenanceCost(record, reporting));
    row.downtimeHours = round2(row.downtimeHours + (record.downtimeHours || 0));
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

export const maintenanceByType = (records: readonly MaintenanceRecord[], reporting: CurrencyCode): MaintenanceGroupRow<MaintenanceType>[] =>
  maintenanceBy(records, (record) => record.type, reporting);

export const maintenanceByVehicle = (records: readonly MaintenanceRecord[], reporting: CurrencyCode): MaintenanceGroupRow<string>[] =>
  maintenanceBy(records, (record) => record.vehicleId, reporting);

// ---- Vehicle operating costs -------------------------------------------------------------

export interface VehicleCostRow {
  vehicleId: string;
  trips: number;
  distanceKm: number;
  fuel: number;
  expenses: number;
  maintenance: number;
  total: number;
  /** Total operating cost per loaded km; null without distance. */
  costPerKm: number | null;
}

/**
 * Operating cost per vehicle in the period: all fuel purchases, non-rejected expenses linked
 * to the vehicle and completed maintenance, over the km of its finished trips.
 */
export function vehicleOperatingCosts(
  input: {
    vehicleIds: readonly string[];
    fuel: readonly FuelRecord[];
    expenses: readonly Expense[];
    maintenance: readonly MaintenanceRecord[];
    trips: readonly Trip[];
  },
  reporting: CurrencyCode,
): VehicleCostRow[] {
  const rows = new Map<string, VehicleCostRow>(
    input.vehicleIds.map((id) => [id, { vehicleId: id, trips: 0, distanceKm: 0, fuel: 0, expenses: 0, maintenance: 0, total: 0, costPerKm: null }]),
  );
  const row = (id: string) => {
    let entry = rows.get(id);
    if (!entry) {
      entry = { vehicleId: id, trips: 0, distanceKm: 0, fuel: 0, expenses: 0, maintenance: 0, total: 0, costPerKm: null };
      rows.set(id, entry);
    }
    return entry;
  };
  for (const record of input.fuel) row(record.vehicleId).fuel = round2(row(record.vehicleId).fuel + toReporting(record.totalAmount, reporting));
  for (const expense of input.expenses) {
    if (!expense.vehicleId || expense.approvalStatus === 'rejected') continue;
    row(expense.vehicleId).expenses = round2(row(expense.vehicleId).expenses + toReporting(expense.amount, reporting));
  }
  for (const record of input.maintenance) {
    row(record.vehicleId).maintenance = round2(row(record.vehicleId).maintenance + maintenanceCost(record, reporting));
  }
  for (const trip of input.trips) {
    const entry = row(trip.vehicleId);
    entry.trips += 1;
    entry.distanceKm += tripDistanceKm(trip);
  }
  return [...rows.values()]
    .map((entry) => {
      const total = round2(entry.fuel + entry.expenses + entry.maintenance);
      return { ...entry, total, costPerKm: entry.distanceKm > 0 ? round2(total / entry.distanceKm) : null };
    })
    .filter((entry) => entry.total > 0 || entry.trips > 0)
    .sort((a, b) => b.total - a.total);
}

// ---- Customers ---------------------------------------------------------------------------

export interface CustomerPerformanceRow extends ProfitabilityGroup {
  customerId: string;
  outstanding: Money | null;
  outstandingReporting: number;
}

/** Profitability per customer (domain aggregation) joined with the demo outstanding balance. */
export function customerPerformance(rows: readonly TripRow[], customers: readonly Customer[], reporting: CurrencyCode): CustomerPerformanceRow[] {
  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  return groupRows(rows, 'customer')
    .map((group) => {
      const outstanding = byId.get(group.key)?.outstandingBalance ?? null;
      return {
        ...group,
        customerId: group.key,
        outstanding,
        outstandingReporting: outstanding ? toReporting(outstanding, reporting) : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

// ---- Routes ------------------------------------------------------------------------------

export interface RoutePerformanceRow extends ProfitabilityGroup {
  avgDurationHours: number | null;
  avgDelayHours: number | null;
  /** Share of trips arriving within one hour of plan. */
  onTimeRatio: number | null;
}

/** Hours from departure to arrival, using actual times when both exist. */
export function tripDurationHours(trip: Trip): number {
  if (trip.actualDeparture && trip.actualArrival) return Math.max(0, hoursBetween(trip.actualDeparture, trip.actualArrival));
  return Math.max(0, hoursBetween(trip.plannedDeparture, trip.plannedArrival));
}

export function routePerformance(rows: readonly TripRow[], now: IsoDateTime): RoutePerformanceRow[] {
  const byRoute = new Map<string, TripRow[]>();
  for (const row of rows) {
    const key = routeKey(row.trip);
    byRoute.set(key, [...(byRoute.get(key) ?? []), row]);
  }
  return groupRows(rows, 'route')
    .map((group) => {
      const trips = (byRoute.get(group.key) ?? []).map((row) => row.trip);
      const count = trips.length;
      const delays = trips.map((trip) => delayHours(trip, now));
      return {
        ...group,
        avgDurationHours: count ? round2(trips.reduce((sum, trip) => sum + tripDurationHours(trip), 0) / count) : null,
        avgDelayHours: count ? round2(delays.reduce((sum, value) => sum + value, 0) / count) : null,
        onTimeRatio: count ? delays.filter((value) => value <= 1).length / count : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
