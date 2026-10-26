import { FuelRecord, FuelWarning, Vehicle } from '../models';

/*
 * Consistency checks for fuel records. A warning means "please review this reading";
 * it never asserts misuse or fraud.
 */

export const HIGH_CONSUMPTION_TOLERANCE = 0.25;
export const LOW_CONSUMPTION_TOLERANCE = 0.4;
const TOTAL_MISMATCH_TOLERANCE = 0.01;

export interface FuelAnalysis {
  recordId: string;
  /** km since the previous record of the same vehicle (null for the first, or invalid). */
  distanceSincePrevious: number | null;
  /** L/100 km since the previous full-tank fill; null when it cannot be computed reliably. */
  consumptionL100km: number | null;
  warnings: FuelWarning[];
}

/** Analyses every record against the previous record of the same vehicle. */
export function analyseFuelRecords(records: readonly FuelRecord[], vehicles: readonly Vehicle[]): Map<string, FuelAnalysis> {
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const byVehicle = new Map<string, FuelRecord[]>();
  for (const record of records) {
    const list = byVehicle.get(record.vehicleId) ?? [];
    list.push(record);
    byVehicle.set(record.vehicleId, list);
  }

  const result = new Map<string, FuelAnalysis>();
  byVehicle.forEach((list, vehicleId) => {
    const vehicle = vehicleById.get(vehicleId);
    const sorted = [...list].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    sorted.forEach((record, index) => {
      const previous = index > 0 ? sorted[index - 1] : null;
      result.set(record.id, analyseFuelRecord(record, previous, vehicle));
    });
  });
  return result;
}

export function analyseFuelRecord(record: FuelRecord, previous: FuelRecord | null, vehicle: Vehicle | undefined): FuelAnalysis {
  const warnings: FuelWarning[] = [];
  let distance: number | null = null;
  let consumption: number | null = null;

  if (previous) {
    const delta = record.odometerKm - previous.odometerKm;
    if (delta < 0) {
      warnings.push({ code: 'odometer_regression', params: { previous: previous.odometerKm, current: record.odometerKm } });
    } else {
      distance = delta;
      if (delta > 0 && record.fullTank) {
        consumption = Math.round((record.litres / delta) * 1000) / 10;
      }
    }
  }

  if (vehicle) {
    if (record.litres > vehicle.tankCapacityL) {
      warnings.push({ code: 'exceeds_tank_capacity', params: { litres: record.litres, capacity: vehicle.tankCapacityL } });
    }
    if (consumption !== null && vehicle.expectedConsumptionL100km > 0) {
      const expected = vehicle.expectedConsumptionL100km;
      if (consumption > expected * (1 + HIGH_CONSUMPTION_TOLERANCE)) {
        warnings.push({ code: 'high_consumption', params: { value: consumption, expected } });
      } else if (consumption < expected * (1 - LOW_CONSUMPTION_TOLERANCE)) {
        warnings.push({ code: 'low_consumption', params: { value: consumption, expected } });
      }
    }
  }

  const expectedTotal = record.litres * record.pricePerLitre.amount;
  if (
    record.totalAmount.currency === record.pricePerLitre.currency &&
    expectedTotal > 0 &&
    Math.abs(record.totalAmount.amount - expectedTotal) / expectedTotal > TOTAL_MISMATCH_TOLERANCE
  ) {
    warnings.push({ code: 'total_mismatch', params: { expected: Math.round(expectedTotal * 100) / 100 } });
  }

  return { recordId: record.id, distanceSincePrevious: distance, consumptionL100km: consumption, warnings };
}

/** Fleet-level average consumption over records with a valid computed value. */
export function averageConsumption(analyses: Iterable<FuelAnalysis>): number | null {
  let total = 0;
  let count = 0;
  for (const analysis of analyses) {
    if (analysis.consumptionL100km !== null && !analysis.warnings.length) {
      total += analysis.consumptionL100km;
      count += 1;
    }
  }
  return count ? Math.round((total / count) * 10) / 10 : null;
}
