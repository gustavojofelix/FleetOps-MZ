import { TestBed } from '@angular/core/testing';
import { MOCK_LATENCY_MS } from '../data-access/mock-collection';
import { provideMockDataAccess } from '../data-access/provide-data-access';
import { DriverRepository, ExpenseRepository, TripRepository, VehicleRepository } from '../data-access/repositories';
import { CurrencyService } from '../formatting/currency.service';
import { CompanySettingsService } from '../state/company-settings.service';
import { PreferencesService } from '../state/preferences.service';
import { TripWorkflowService } from './trip-workflow.service';

describe('TripWorkflowService (mock data layer)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideMockDataAccess(), { provide: MOCK_LATENCY_MS, useValue: 0 }],
    });
  });

  it('commits vehicle and driver when a planned trip goes in transit, and releases them on delivery', async () => {
    const workflow = TestBed.inject(TripWorkflowService);
    const trips = TestBed.inject(TripRepository);
    const vehicles = TestBed.inject(VehicleRepository);
    const drivers = TestBed.inject(DriverRepository);

    const planned = (await trips.all()).find((t) => t.status === 'planned' && t.vehicleId === 'v24')!;
    expect(planned).toBeTruthy();

    await workflow.changeStatus(planned.id, 'preparing');
    const inTransit = await workflow.changeStatus(planned.id, 'in_transit', 'Partida');
    expect(inTransit.actualDeparture).not.toBeNull();
    expect((await vehicles.getById(planned.vehicleId))?.status).toBe('in_transit');
    expect((await drivers.getById(planned.driverId))?.status).toBe('on_trip');

    const delivered = await workflow.changeStatus(planned.id, 'delivered', 'Entregue');
    expect(delivered.actualArrival).not.toBeNull();
    expect(delivered.timeline.at(-1)?.status).toBe('delivered');
    expect((await vehicles.getById(planned.vehicleId))?.status).toBe('available');
    expect((await drivers.getById(planned.driverId))?.status).toBe('active');
  });

  it('rejects transitions that are not allowed', async () => {
    const workflow = TestBed.inject(TripWorkflowService);
    const completed = (await TestBed.inject(TripRepository).all()).find((t) => t.status === 'completed')!;
    await expect(workflow.changeStatus(completed.id, 'in_transit')).rejects.toThrow();
  });

  it('creates trips with a "created" timeline event and persists them locally', async () => {
    const workflow = TestBed.inject(TripWorkflowService);
    const trips = TestBed.inject(TripRepository);
    const template = (await trips.all())[0];
    const before = (await trips.all()).length;
    const created = await workflow.create(
      {
        reference: 'VG-2026-9999',
        customerId: template.customerId,
        vehicleId: template.vehicleId,
        driverId: template.driverId,
        trailerId: template.trailerId,
        routeId: template.routeId,
        origin: template.origin,
        destination: template.destination,
        plannedDistanceKm: template.plannedDistanceKm,
        cargo: template.cargo,
        plannedDeparture: '2026-11-20T06:00:00+02:00',
        plannedArrival: '2026-11-20T20:00:00+02:00',
        revenue: { amount: 1200, currency: 'USD' },
        customerReference: 'PO-1',
        notes: '',
      },
      'Teste',
    );
    expect(created.status).toBe('planned');
    expect(created.timeline[0].type).toBe('created');
    expect((await trips.all()).length).toBe(before + 1);
    expect(localStorage.getItem('fleetops.demo.v1.trips')).toContain('VG-2026-9999');
  });
});

describe('display currency', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideMockDataAccess(), { provide: MOCK_LATENCY_MS, useValue: 0 }],
    });
  });

  it('changing the display currency never alters stored transaction amounts', async () => {
    await TestBed.inject(CompanySettingsService).load();
    const expenses = TestBed.inject(ExpenseRepository);
    const currency = TestBed.inject(CurrencyService);
    const before = await expenses.all();

    currency.setDisplayCurrency('USD');
    expect(currency.display()).toBe('USD');
    expect(currency.displayIsConverted()).toBe(true);
    expect(TestBed.inject(PreferencesService).displayCurrency()).toBe('USD');

    const after = await expenses.all();
    expect(after.map((e) => e.amount)).toEqual(before.map((e) => e.amount));

    currency.setDisplayCurrency('MZN');
    expect(currency.displayIsConverted()).toBe(false);
  });
});
