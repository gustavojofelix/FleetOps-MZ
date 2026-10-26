import { FuelRecord, Vehicle } from '../models';
import { analyseFuelRecords, averageConsumption } from './fuel-analysis';

const vehicle = { id: 'v1', tankCapacityL: 500, expectedConsumptionL100km: 40 } as Vehicle;

function record(id: string, timestamp: string, odometerKm: number, litres: number, extra: Partial<FuelRecord> = {}): FuelRecord {
  return {
    id,
    organizationId: 'org',
    reference: id,
    timestamp,
    vehicleId: 'v1',
    driverId: null,
    tripId: null,
    odometerKm,
    litres,
    pricePerLitre: { amount: 90, currency: 'MZN' },
    totalAmount: { amount: litres * 90, currency: 'MZN' },
    fullTank: true,
    station: '',
    location: '',
    receiptFileName: null,
    notes: '',
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

describe('fuel analysis', () => {
  it('computes consumption between consecutive fills without warnings', () => {
    const result = analyseFuelRecords(
      [record('a', '2026-10-01T08:00:00+02:00', 10_000, 300), record('b', '2026-10-03T08:00:00+02:00', 10_500, 200)],
      [vehicle],
    );
    expect(result.get('a')?.consumptionL100km).toBeNull();
    expect(result.get('b')?.consumptionL100km).toBe(40);
    expect(result.get('b')?.warnings).toEqual([]);
  });

  it('flags odometer regression, overfill and high consumption for review', () => {
    const result = analyseFuelRecords(
      [
        record('a', '2026-10-01T08:00:00+02:00', 10_000, 300),
        record('b', '2026-10-02T08:00:00+02:00', 9_000, 100),
        record('c', '2026-10-03T08:00:00+02:00', 9_500, 600),
      ],
      [vehicle],
    );
    expect(result.get('b')?.warnings.map((w) => w.code)).toEqual(['odometer_regression']);
    const codes = result.get('c')?.warnings.map((w) => w.code);
    expect(codes).toContain('exceeds_tank_capacity');
    expect(codes).toContain('high_consumption');
  });

  it('does not compute consumption for partial fills', () => {
    const result = analyseFuelRecords(
      [record('a', '2026-10-01T08:00:00+02:00', 10_000, 300), record('b', '2026-10-02T08:00:00+02:00', 10_400, 50, { fullTank: false })],
      [vehicle],
    );
    expect(result.get('b')?.consumptionL100km).toBeNull();
    expect(result.get('b')?.distanceSincePrevious).toBe(400);
  });

  it('flags totals that do not match litres × price', () => {
    const result = analyseFuelRecords([record('a', '2026-10-01T08:00:00+02:00', 10_000, 100, { totalAmount: { amount: 12_000, currency: 'MZN' } })], [vehicle]);
    expect(result.get('a')?.warnings.map((w) => w.code)).toEqual(['total_mismatch']);
  });

  it('averages only clean consumption readings', () => {
    const result = analyseFuelRecords(
      [
        record('a', '2026-10-01T08:00:00+02:00', 10_000, 300),
        record('b', '2026-10-02T08:00:00+02:00', 10_500, 200),
        record('c', '2026-10-03T08:00:00+02:00', 11_000, 400),
      ],
      [vehicle],
    );
    expect(averageConsumption(result.values())).toBe(40);
  });
});
