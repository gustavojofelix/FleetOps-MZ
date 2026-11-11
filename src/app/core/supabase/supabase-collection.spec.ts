import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Customer, Vehicle } from '../models';
import { CurrentOrganization } from './current-organization.service';
import { SupabaseCustomerRepository, SupabaseVehicleRepository } from './repositories/master-data.repositories';
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

  it('drops PostgREST filter syntax from search terms', () => {
    expect(sanitizeSearch(' ab,c(d)*%" ')).toBe('ab c d');
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

  it('does not query the database for non-uuid ids', async () => {
    const { repo, calls } = setup(SupabaseVehicleRepository, { data: null });
    expect(await repo.getById('v-001')).toBeUndefined();
    expect(calls).toEqual([]);
  });
});
