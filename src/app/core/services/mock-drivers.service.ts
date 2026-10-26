import { Injectable } from '@angular/core';
import { MockCollection, MockCollectionConfig } from '../data-access/mock-collection';
import { DriverQuery, DriverRepository } from '../data-access/repositories';
import { Driver } from '../models';

@Injectable()
export class MockDriversService extends MockCollection<Driver, DriverQuery> implements DriverRepository {
  protected readonly config: MockCollectionConfig<Driver> = {
    storageKey: 'drivers',
    idPrefix: 'd',
    fixtures: () => import('../mock-data/drivers.json').then((m) => m.default as unknown as Driver[]),
    searchFields: (d) => [d.firstName, d.lastName, d.employeeNumber, d.phone, d.licenceNumber, d.city],
    defaultSort: { field: 'lastName', direction: 'asc' },
  };

  protected matchesFilters(driver: Driver, query: DriverQuery): boolean {
    return !query.status || driver.status === query.status;
  }

  protected override sortValue(driver: Driver, field: string): unknown {
    if (field === 'name') return `${driver.firstName} ${driver.lastName}`;
    return super.sortValue(driver, field);
  }
}
