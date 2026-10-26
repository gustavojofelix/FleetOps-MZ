import { FuelAnalysis, HIGH_CONSUMPTION_TOLERANCE, LOW_CONSUMPTION_TOLERANCE, averageConsumption } from '../../core/domain/fuel-analysis';
import { sumInCurrency } from '../../core/formatting/currency';
import { monthKey, monthsInRange } from '../../core/formatting/date-utils';
import { CurrencyCode, FuelRecord, IsoDate, IsoDateTime, Vehicle } from '../../core/models';

/*
 * Pure calculations behind the fuel page (summary KPIs, monthly chart, consumption ranking
 * and form helpers). Aggregates are returned in the reporting currency.
 */

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const time = (value: IsoDateTime): number => new Date(value).getTime();

export interface FuelSummary {
  recordCount: number;
  litres: number;
  /** Total fuel cost in the reporting currency (simulated conversion where needed). */
  totalCost: number;
  /** True when at least one record is not in the reporting currency. */
  mixedCurrencies: boolean;
  /** Average L/100 km over clean full-tank readings; null when none. */
  averageConsumption: number | null;
  warningCount: number;
  /** Litre-weighted average price of MZN-priced (Mozambican) fills; null when none. */
  averagePricePerLitreMzn: number | null;
  mznRecordCount: number;
}

export function summariseFuel(
  records: readonly FuelRecord[],
  analyses: ReadonlyMap<string, FuelAnalysis>,
  reporting: CurrencyCode,
): FuelSummary {
  let litres = 0;
  let mznLitres = 0;
  let mznTotal = 0;
  let mznCount = 0;
  let warningCount = 0;
  const scoped: FuelAnalysis[] = [];

  for (const record of records) {
    litres += record.litres;
    if (record.pricePerLitre.currency === 'MZN' && record.totalAmount.currency === 'MZN') {
      mznLitres += record.litres;
      mznTotal += record.totalAmount.amount;
      mznCount += 1;
    }
    const analysis = analyses.get(record.id);
    if (analysis) {
      scoped.push(analysis);
      if (analysis.warnings.length) warningCount += 1;
    }
  }

  return {
    recordCount: records.length,
    litres: round(litres, 1),
    totalCost: sumInCurrency(
      records.map((record) => record.totalAmount),
      reporting,
    ),
    mixedCurrencies: records.some((record) => record.totalAmount.currency !== reporting),
    averageConsumption: averageConsumption(scoped),
    warningCount,
    averagePricePerLitreMzn: mznLitres > 0 ? round(mznTotal / mznLitres) : null,
    mznRecordCount: mznCount,
  };
}

/**
 * Month keys (YYYY-MM) for the chart: the selected period, or the span of the data when the
 * period is open-ended, capped to the most recent `maxMonths`.
 */
export function fuelChartMonths(
  timestamps: readonly IsoDateTime[],
  from: IsoDate | null,
  to: IsoDate | null,
  maxMonths = 12,
): string[] {
  const keys = timestamps.map((value) => monthKey(value)).sort();
  const start = from ? from.slice(0, 7) : keys[0];
  const end = to ? to.slice(0, 7) : keys[keys.length - 1];
  if (!start || !end || start > end) return [];
  const months = monthsInRange(`${start}-01`, `${end}-01`);
  return months.slice(-maxMonths);
}

export interface MonthlyFuel {
  month: string;
  litres: number;
  /** Reporting currency. */
  cost: number;
}

export function monthlyFuel(records: readonly FuelRecord[], months: readonly string[], reporting: CurrencyCode): MonthlyFuel[] {
  const byMonth = new Map<string, FuelRecord[]>();
  for (const record of records) {
    const key = monthKey(record.timestamp);
    const list = byMonth.get(key) ?? [];
    list.push(record);
    byMonth.set(key, list);
  }
  return months.map((month) => {
    const list = byMonth.get(month) ?? [];
    return {
      month,
      litres: round(
        list.reduce((sum, record) => sum + record.litres, 0),
        1,
      ),
      cost: sumInCurrency(
        list.map((record) => record.totalAmount),
        reporting,
      ),
    };
  });
}

export type ConsumptionTone = 'above' | 'below' | 'normal';

export interface VehicleConsumption {
  vehicleId: string;
  /** Average L/100 km over clean readings. */
  average: number;
  /** Reference consumption configured on the vehicle. */
  expected: number;
  /** (average − expected) / expected; null when no reference is configured. */
  deviation: number | null;
  tone: ConsumptionTone;
  samples: number;
}

/** Vehicles ranked by average consumption (highest first), using only readings without warnings. */
export function consumptionByVehicle(
  records: readonly FuelRecord[],
  analyses: ReadonlyMap<string, FuelAnalysis>,
  vehicles: readonly Vehicle[],
  limit = 8,
): VehicleConsumption[] {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const record of records) {
    const analysis = analyses.get(record.id);
    if (!analysis || analysis.consumptionL100km === null || analysis.warnings.length) continue;
    const entry = totals.get(record.vehicleId) ?? { sum: 0, count: 0 };
    entry.sum += analysis.consumptionL100km;
    entry.count += 1;
    totals.set(record.vehicleId, entry);
  }
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const result: VehicleConsumption[] = [];
  totals.forEach((entry, vehicleId) => {
    const average = round(entry.sum / entry.count, 1);
    const expected = vehicleById.get(vehicleId)?.expectedConsumptionL100km ?? 0;
    const deviation = expected > 0 ? (average - expected) / expected : null;
    let tone: ConsumptionTone = 'normal';
    if (deviation !== null && deviation > HIGH_CONSUMPTION_TOLERANCE) tone = 'above';
    else if (deviation !== null && deviation < -LOW_CONSUMPTION_TOLERANCE) tone = 'below';
    result.push({ vehicleId, average, expected, deviation, tone, samples: entry.count });
  });
  return result.sort((a, b) => b.average - a.average).slice(0, limit);
}

/** Total of a fill: litres × price per litre, rounded to cents. */
export function fuelTotal(litres: number | null | undefined, pricePerLitre: number | null | undefined): number {
  if (!litres || !pricePerLitre || litres < 0 || pricePerLitre < 0) return 0;
  return round(litres * pricePerLitre);
}

/** The latest record of the vehicle strictly before `timestamp` (optionally ignoring the record being edited). */
export function previousFuelRecord(
  records: readonly FuelRecord[],
  vehicleId: string,
  timestamp: IsoDateTime,
  excludeId: string | null = null,
): FuelRecord | null {
  const limit = time(timestamp);
  let best: FuelRecord | null = null;
  for (const record of records) {
    if (record.vehicleId !== vehicleId || record.id === excludeId) continue;
    const at = time(record.timestamp);
    if (at >= limit) continue;
    if (!best || at > time(best.timestamp)) best = record;
  }
  return best;
}

/** Next sequential reference such as ABS-02155 (keeps the widest numeric width in use). */
export function nextReference(existing: readonly string[], prefix: string, minDigits = 5): string {
  let max = 0;
  let width = minDigits;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  for (const reference of existing) {
    const match = pattern.exec(reference);
    if (!match) continue;
    max = Math.max(max, Number(match[1]));
    width = Math.max(width, match[1].length);
  }
  return `${prefix}-${String(max + 1).padStart(width, '0')}`;
}
