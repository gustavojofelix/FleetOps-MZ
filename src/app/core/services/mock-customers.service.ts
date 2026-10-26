import { Injectable } from '@angular/core';
import { MockCollection, MockCollectionConfig } from '../data-access/mock-collection';
import { CustomerQuery, CustomerRepository } from '../data-access/repositories';
import { Customer } from '../models';

@Injectable()
export class MockCustomersService extends MockCollection<Customer, CustomerQuery> implements CustomerRepository {
  protected readonly config: MockCollectionConfig<Customer> = {
    storageKey: 'customers',
    idPrefix: 'c',
    fixtures: () => import('../mock-data/customers.json').then((m) => m.default as unknown as Customer[]),
    searchFields: (c) => [c.name, c.legalName, c.code, c.city, c.contactName, c.taxId],
    defaultSort: { field: 'name', direction: 'asc' },
  };

  protected matchesFilters(customer: Customer, query: CustomerQuery): boolean {
    if (query.status && customer.status !== query.status) return false;
    if (query.segment && customer.segment !== query.segment) return false;
    if (query.country && customer.country !== query.country) return false;
    return true;
  }
}
