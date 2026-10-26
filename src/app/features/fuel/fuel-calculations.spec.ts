import { analyseFuelRecords } from '../../core/domain/fuel-analysis';
import { FuelRecord, Money, Vehicle } from '../../core/models';
import {
  consumptionByVehicle,
  fuelChartMonths,
  fuelTotal,
  monthlyFuel,
  nextReference,
  previousFuelRecord,
  summariseFuel,
} from './fuel-calculations';

const vehicles = [
  { id: 'v1', tankCapacityL: 500, expectedConsumptionL100km: 40 },
  { id: 'v2', tankCapacityL: 400, expectedConsumptionL100km: 30 },
] as Vehicle[];

function record(id: string, vehicleId: string, timestamp: string, odometerKm: number, litres: number, price: Money = { amount: 90, currency: 'MZN' }): FuelRecord {
  return {
    id,
    organizationId: 'org',
    reference: `ABS-${id}`,
    timestamp,
    vehicleId,
    driverId: null,
    tripId: null,
    odometerKm,
    litres,
    pricePerLitre: price,
    totalAmount: { amount: litres * price.amount, currency: price.currency },
    fullTank: true,
    station: '',
    location: '',
    receiptFileName: null,
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const records = [
  record('1', 'v1', '2026-09-01T08:00:00+02:00', 10_000, 200),
  record('2', 'v1', '2026-09-05T08:00:00+02:00', 10_500, 200), // 40 L/100 km
  record('3', 'v1', '2026-10-02T08:00:00+02:00', 10_400, 100), // odometer regression → warning
  record('4', 'v2', '2026-10-03T08:00:00+02:00', 5_000, 100, { amount: 1.4, currency: 'USD' }),
  record('5', 'v2', '2026-10-10T08:00:00+02:00', 5_500, 150, { amount: 1.4, currency: 'USD' }), // 30 L/100 km
];

describe('fuel calculations', () => {
  const analyses = analyseFuelRecords(records, vehicles);

  it('summarises litres, cost, warnings and the MZN price per litre', () => {
    const summary = summariseFuel(records, analyses, 'MZN');
    expect(summary.recordCount).toBe(5);
    expect(summary.litres).toBe(750);
    expect(summary.warningCount).toBe(1);
    expect(summary.mixedCurrencies).toBe(true);
    expect(summary.averageConsumption).toBe(35);
    expect(summary.averagePricePerLitreMzn).toBe(90);
    expect(summary.mznRecordCount).toBe(3);
    // 500 L × 90 MZN + 250 L × 1.4 USD × 63.9
    expect(summary.totalCost).toBeCloseTo(45_000 + 350 * 63.9, 2);
  });

  it('returns null averages when there is nothing to average', () => {
    const summary = summariseFuel([], new Map(), 'MZN');
    expect(summary.averageConsumption).toBeNull();
    expect(summary.averagePricePerLitreMzn).toBeNull();
    expect(summary.totalCost).toBe(0);
  });

  it('groups litres and cost by month', () => {
    const months = fuelChartMonths(records.map((r) => r.timestamp), '2026-08-15', '2026-10-24');
    expect(months).toEqual(['2026-08', '2026-09', '2026-10']);
    const monthly = monthlyFuel(records, months, 'MZN');
    expect(monthly.map((m) => m.litres)).toEqual([0, 400, 350]);
    expect(monthly[1].cost).toBe(36_000);
  });

  it('derives chart months from the data for open periods and caps them', () => {
    expect(fuelChartMonths(records.map((r) => r.timestamp), null, null)).toEqual(['2026-09', '2026-10']);
    expect(fuelChartMonths(['2025-01-10T00:00:00+02:00', '2026-10-01T00:00:00+02:00'], null, null, 3)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(fuelChartMonths([], null, null)).toEqual([]);
  });

  it('ranks vehicles by clean consumption against their reference', () => {
    const ranking = consumptionByVehicle(records, analyses, vehicles);
    expect(ranking.map((r) => r.vehicleId)).toEqual(['v1', 'v2']);
    expect(ranking[0]).toMatchObject({ average: 40, expected: 40, deviation: 0, tone: 'normal', samples: 1 });
  });

  it('computes totals and finds the previous reading of a vehicle', () => {
    expect(fuelTotal(240.4, 89.2)).toBe(21_443.68);
    expect(fuelTotal(null, 89.2)).toBe(0);
    expect(previousFuelRecord(records, 'v1', '2026-09-10T00:00:00+02:00')?.id).toBe('2');
    expect(previousFuelRecord(records, 'v1', '2026-09-05T08:00:00+02:00', '1')).toBeNull();
    expect(previousFuelRecord(records, 'v9', '2026-09-10T00:00:00+02:00')).toBeNull();
  });

  it('generates the next sequential reference', () => {
    expect(nextReference(['ABS-02101', 'ABS-02154', 'X-1'], 'ABS')).toBe('ABS-02155');
    expect(nextReference([], 'ABS')).toBe('ABS-00001');
  });
});
