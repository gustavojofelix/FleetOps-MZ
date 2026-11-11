import { TestBed } from '@angular/core/testing';
import { OrganizationRepository, TripRepository } from '../data-access/repositories';
import { CurrencyService } from '../formatting/currency.service';
import { PreferencesService } from '../state/preferences.service';
import { Trip, TripStatus } from '../models';
import { TripWorkflowService, TripInput } from './trip-workflow.service';

/** Minimal in-memory TripRepository: the workflow only validates and delegates. */
function fakeTrips(initial: Partial<Trip>[]) {
  const store = new Map(initial.map((t) => [t.id!, { timeline: [], ...t } as Trip]));
  const calls: unknown[][] = [];
  const repository = {
    getById: async (id: string) => store.get(id),
    changeStatus: async (id: string, status: TripStatus, note: string, delayReason: string | null) => {
      calls.push(['changeStatus', id, status, note, delayReason]);
      const trip = { ...store.get(id)!, status };
      store.set(id, trip);
      return trip;
    },
    create: async (input: Omit<Trip, 'id'>) => {
      calls.push(['create', input]);
      return { ...input, id: 'new' } as Trip;
    },
    update: async (id: string, changes: Partial<Trip>) => ({ ...store.get(id)!, ...changes }),
    delete: async (id: string) => void calls.push(['delete', id]),
  };
  return { repository, calls };
}

describe('TripWorkflowService', () => {
  function setup(trips: Partial<Trip>[]) {
    const fake = fakeTrips(trips);
    TestBed.configureTestingModule({ providers: [{ provide: TripRepository, useValue: fake.repository }] });
    return { workflow: TestBed.inject(TripWorkflowService), calls: fake.calls };
  }

  it('delegates allowed transitions to the repository (the database syncs resources)', async () => {
    const { workflow, calls } = setup([{ id: 't1', status: 'in_transit' }]);
    await workflow.changeStatus('t1', 'delayed', '', 'Fronteira');
    expect(calls).toEqual([['changeStatus', 't1', 'delayed', '', 'Fronteira']]);
  });

  it('rejects transitions that are not allowed without calling the backend', async () => {
    const { workflow, calls } = setup([{ id: 't1', status: 'completed' }]);
    await expect(workflow.changeStatus('t1', 'in_transit')).rejects.toThrow('Invalid transition');
    expect(calls).toEqual([]);
  });

  it('creates planned trips with a "created" timeline event carrying the note', async () => {
    const { workflow, calls } = setup([]);
    await workflow.create({ origin: { city: 'Beira', country: 'MZ', site: '' } } as TripInput, 'Criada por Ana');
    const input = calls[0][1] as Trip;
    expect(input.status).toBe('planned');
    expect(input.timeline[0]).toMatchObject({ type: 'created', status: 'planned', location: 'Beira', note: 'Criada por Ana' });
  });
});

describe('display currency', () => {
  it('is a personal preference that converts only what is displayed', () => {
    TestBed.configureTestingModule({ providers: [{ provide: OrganizationRepository, useValue: {} }] });
    const currency = TestBed.inject(CurrencyService);
    currency.setDisplayCurrency('USD');
    expect(currency.display()).toBe('USD');
    expect(currency.displayIsConverted()).toBe(true);
    expect(TestBed.inject(PreferencesService).displayCurrency()).toBe('USD');
    currency.setDisplayCurrency('MZN');
    expect(currency.displayIsConverted()).toBe(false);
  });
});
