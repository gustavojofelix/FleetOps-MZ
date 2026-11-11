import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Customer, Vehicle } from '../models';
import { CurrentOrganization } from './current-organization.service';
import { SupabaseCustomerRepository, SupabaseVehicleRepository } from './repositories/master-data.repositories';
import { DriverRepository, TrailerRepository, VehicleRepository } from '../data-access/repositories';
import { exchangeRate, exchangeRatesInUse, setExchangeRates, SIMULATED_RATES_EFFECTIVE_DATE, SIMULATED_RATES_TO_MZN } from '../formatting/currency';
import { ClockService } from '../services/clock.service';
import { SupabaseDocumentRepository, SupabaseNotificationRepository } from './repositories/admin.repositories';
import { SupabaseExpenseRepository, SupabaseMaintenanceRepository } from './repositories/cost.repositories';
import { storageName } from './supabase-file-storage';
import { SupabaseTripRepository } from './repositories/trip.repository';
import { SUPABASE } from './supabase-client';
import { sanitizeSearch, toCamel, toSnake } from './supabase-collection';

type Call = [method: string, ...args: unknown[]];

/** Chainable stand-in for the PostgREST builder: records every call and resolves to `result`. */
function fakeClient(result: { data: unknown; error?: unknown; count?: number }) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  const chain = new Proxy(builder, {
    get(_, prop: string) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ error: null, ...result });
      return (...args: unknown[]) => {
        calls.push([prop, ...args]);
        return chain;
      };
    },
  });
  return { calls, client: { from: (table: string) => (calls.push(['from', table]), chain), rpc: () => chain } };
}

function setup<T>(type: new () => T, result: { data: unknown; count?: number }) {
  const fake = fakeClient(result);
  TestBed.configureTestingModule({
    providers: [
      type as never,
      { provide: SUPABASE, useValue: fake.client },
      { provide: CurrentOrganization, useValue: { organizationId: () => 'org-1', membership: () => null } },
    ],
  });
  return { repo: TestBed.inject(type), calls: fake.calls };
}

function setupTrips(result: { data: unknown; count?: number }) {
  const fake = fakeClient(result);
  const rpcCalls: unknown[][] = [];
  const client = { ...fake.client, rpc: (...args: unknown[]) => (rpcCalls.push(args), fake.client.from('rpc')) };
  TestBed.configureTestingModule({
    providers: [
      SupabaseTripRepository,
      { provide: SUPABASE, useValue: client },
      { provide: CurrentOrganization, useValue: { organizationId: () => 'org-1', membership: () => null } },
      { provide: VehicleRepository, useValue: {} },
      { provide: DriverRepository, useValue: {} },
      { provide: TrailerRepository, useValue: {} },
    ],
  });
  return { repo: TestBed.inject(SupabaseTripRepository), calls: fake.calls, rpcCalls };
}

const customerRow = {
  id: '6f1c2a3e-0000-4000-8000-000000000001',
  organization_id: 'org-1',
  name: 'Mina Norte',
  payment_terms_days: 30,
  credit_limit_amount: 1500.5,
  credit_limit_currency: 'USD',
  outstanding_balance_amount: 0,
  outstanding_balance_currency: 'MZN',
};

describe('snake/camel conversion', () => {
  it('round-trips model field names, including unit suffixes', () => {
    for (const field of ['plateNumber', 'expectedConsumptionL100km', 'tankCapacityL', 'organizationId', 'crossBorderAuthorized']) {
      expect(toCamel(toSnake(field))).toBe(field);
    }
    expect(toSnake('expectedConsumptionL100km')).toBe('expected_consumption_l100km');
  });

  it('makes storage-safe file names (accents, spaces, symbols)', () => {
    expect(storageName('Apólice seguro (2026) nº1.pdf')).toBe('Apolice_seguro_2026_no1.pdf');
    expect(storageName('???')).toBe('_');
  });

  it('drops PostgREST filter syntax from search terms', () => {
    expect(sanitizeSearch(' ab,c(d)*%" ')).toBe('ab c d');
  });
});

describe('exchange rates loaded from the backend', () => {
  it('replace the demo rates for every conversion and report their date', () => {
    try {
      setExchangeRates({ USD: 70, ZAR: 4 }, '2026-11-01');
      expect(exchangeRate('USD', 'MZN').rate).toBe(70);
      expect(exchangeRate('USD', 'ZAR').rate).toBe(17.5);
      expect(exchangeRate('USD', 'MZN').effectiveDate).toBe('2026-11-01');
      expect(exchangeRatesInUse().ratesToMzn.MZN).toBe(1);
    } finally {
      setExchangeRates(SIMULATED_RATES_TO_MZN, SIMULATED_RATES_EFFECTIVE_DATE);
    }
  });
});

describe('SupabaseCollection', () => {
  it('maps money columns to Money objects when reading', async () => {
    const { repo } = setup(SupabaseCustomerRepository, { data: [customerRow], count: 1 });
    const [customer] = (await repo.list()).items;
    expect(customer.creditLimit).toEqual({ amount: 1500.5, currency: 'USD' });
    expect(customer.paymentTermsDays).toBe(30);
    expect('creditLimitAmount' in customer).toBe(false);
  });

  it('builds filters, search, sort and range for a paged list', async () => {
    const { repo, calls } = setup(SupabaseCustomerRepository, { data: [customerRow], count: 41 });
    const result = await repo.list({ status: 'active', segment: null, search: 'mina', sort: { field: 'paymentTermsDays', direction: 'desc' }, page: 3, pageSize: 20 });
    expect(calls).toContainEqual(['eq', 'status', 'active']);
    expect(calls.some(([m, a]) => m === 'eq' && a === 'segment')).toBe(false);
    expect(calls).toContainEqual(['or', 'name.ilike.%mina%,legal_name.ilike.%mina%,code.ilike.%mina%,city.ilike.%mina%,contact_name.ilike.%mina%,tax_id.ilike.%mina%']);
    expect(calls).toContainEqual(['order', 'payment_terms_days', { ascending: false }]);
    expect(calls).toContainEqual(['range', 40, 59]);
    expect(result).toMatchObject({ total: 41, page: 3, pageSize: 20 });
  });

  it('writes snake_case columns, splits Money and sets the organization on insert', async () => {
    const { repo, calls } = setup(SupabaseCustomerRepository, { data: customerRow });
    await repo.create({ name: 'Mina Norte', creditLimit: { amount: 10, currency: 'ZAR' }, paymentTermsDays: 15 } as unknown as Omit<Customer, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>);
    const insert = calls.find(([m]) => m === 'insert')?.[1];
    expect(insert).toEqual({ name: 'Mina Norte', credit_limit_amount: 10, credit_limit_currency: 'ZAR', payment_terms_days: 15, organization_id: 'org-1' });
  });

  it('never writes system fields or embedded history, and stores empty optional values as null', async () => {
    const { repo, calls } = setup(SupabaseVehicleRepository, { data: { id: 'x', vehicle_status_changes: [] } });
    await repo.update('x', { id: 'hack', organizationId: 'other', statusHistory: [], acquisitionDate: '', assignedDriverId: null, notes: 'ok' } as unknown as Partial<Vehicle>);
    expect(calls.find(([m]) => m === 'update')?.[1]).toEqual({ acquisition_date: null, assigned_driver_id: null, notes: 'ok' });
  });

  it('maps the embedded status history and reads null dates as empty strings', async () => {
    const { repo } = setup(SupabaseVehicleRepository, {
      data: {
        id: '6f1c2a3e-0000-4000-8000-000000000002',
        acquisition_date: null,
        vehicle_status_changes: [{ changed_on: '2026-11-01', from_status: 'available', to_status: 'maintenance', reason: 'Revisão', created_at: 'x' }],
      },
    });
    const vehicle = await repo.getById('6f1c2a3e-0000-4000-8000-000000000002');
    expect(vehicle?.statusHistory).toEqual([{ date: '2026-11-01', from: 'available', to: 'maintenance', reason: 'Revisão' }]);
    expect(vehicle?.acquisitionDate).toBe('');
    expect(vehicle && 'vehicleStatusChanges' in vehicle).toBe(false);
  });

  it('maps trips: timeline from trip_events, status list and date-range filters', async () => {
    const { repo, calls } = setupTrips({
      data: [
        {
          id: 't1',
          revenue_amount: 900,
          revenue_currency: 'USD',
          trip_events: [{ id: 'e1', occurred_at: '2026-11-11T08:00:00+00:00', type: 'created', status: 'planned', location: 'Beira', note: 'n' }],
        },
      ],
      count: 1,
    });
    const [trip] = (await repo.list({ statuses: ['in_transit', 'delayed'], from: '2026-11-01', to: '2026-11-30', sort: { field: 'revenue.amount', direction: 'desc' } })).items;
    expect(trip.timeline).toEqual([{ id: 'e1', timestamp: '2026-11-11T08:00:00+00:00', type: 'created', status: 'planned', location: 'Beira', note: 'n' }]);
    expect(trip.revenue).toEqual({ amount: 900, currency: 'USD' });
    expect(calls).toContainEqual(['in', 'status', ['in_transit', 'delayed']]);
    expect(calls).toContainEqual(['gte', 'planned_departure', '2026-11-01']);
    expect(calls).toContainEqual(['lt', 'planned_departure', '2026-12-01']);
    expect(calls).toContainEqual(['order', 'revenue_amount', { ascending: false }]);
  });

  it('creates trips through the create_trip RPC with the first timeline note', async () => {
    const { repo, rpcCalls } = setupTrips({ data: 't-new' });
    await repo.create({ reference: 'VG-1', revenue: { amount: 5, currency: 'MZN' }, timeline: [{ note: 'Criada por Ana' }] } as never).catch(() => undefined);
    expect(rpcCalls[0]).toEqual([
      'create_trip',
      { p_trip: { reference: 'VG-1', revenue_amount: 5, revenue_currency: 'MZN', organization_id: 'org-1' }, p_note: 'Criada por Ana' },
    ]);
  });

  it('filters maintenance "overdue" as scheduled work planned before today', async () => {
    const { repo, calls } = setup(SupabaseMaintenanceRepository, { data: [], count: 0 });
    TestBed.inject(ClockService).today = () => '2026-11-11';
    await repo.list({ displayStatus: 'overdue' });
    expect(calls).toContainEqual(['eq', 'status', 'scheduled']);
    expect(calls).toContainEqual(['lt', 'planned_date', '2026-11-11']);
  });

  it('maps expense amounts and keeps a cleared submitter as an empty id', async () => {
    const { repo } = setup(SupabaseExpenseRepository, {
      data: [{ id: 'e', amount_amount: 450, amount_currency: 'ZAR', submitted_by_user_id: null }],
      count: 1,
    });
    const [expense] = (await repo.list()).items;
    expect(expense.amount).toEqual({ amount: 450, currency: 'ZAR' });
    expect(expense.submittedByUserId).toBe('');
  });

  it('filters documents by derived expiry status like expiryStatus()', async () => {
    const { repo, calls } = setup(SupabaseDocumentRepository, { data: [], count: 0 });
    TestBed.inject(ClockService).today = () => '2026-11-11';
    await repo.list({ status: 'expiring' });
    expect(calls).toContainEqual(['gte', 'expiry_date', '2026-11-11']);
    expect(calls).toContainEqual(['lte', 'expiry_date', '2026-12-11']);
  });

  it('reads notifications from the feed view and stores read state per user', async () => {
    const { repo, calls } = setup(SupabaseNotificationRepository, {
      data: [{ id: 'n1', title_key: 't', message_key: 'm', params: { trip: 'VG-1' }, link: ['/trips', 'x'], read: false }],
      count: 1,
    });
    const [notification] = (await repo.list({ unreadOnly: true })).items;
    expect(calls).toContainEqual(['from', 'notifications_feed']);
    expect(calls).toContainEqual(['eq', 'read', false]);
    expect(notification).toMatchObject({ titleKey: 't', messageKey: 'm', link: ['/trips', 'x'], read: false });
    await repo.markRead('n1', false);
    expect(calls).toContainEqual(['from', 'notification_reads']);
    expect(calls).toContainEqual(['eq', 'notification_id', 'n1']);
  });

  it('does not query the database for non-uuid ids', async () => {
    const { repo, calls } = setup(SupabaseVehicleRepository, { data: null });
    expect(await repo.getById('v-001')).toBeUndefined();
    expect(calls).toEqual([]);
  });
});
