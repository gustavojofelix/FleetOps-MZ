import { Injectable } from '@angular/core';
import { MockCollection, MockCollectionConfig } from '../data-access/mock-collection';
import { FuelQuery, FuelRepository } from '../data-access/repositories';
import { isWithinRange } from '../formatting/date-utils';
import { FuelRecord } from '../models';

@Injectable()
export class MockFuelService extends MockCollection<FuelRecord, FuelQuery> implements FuelRepository {
  protected readonly config: MockCollectionConfig<FuelRecord> = {
    storageKey: 'fuel-records',
    idPrefix: 'f',
    fixtures: () => import('../mock-data/fuel-records.json').then((m) => m.default as unknown as FuelRecord[]),
    searchFields: (f) => [f.reference, f.station, f.location],
    defaultSort: { field: 'timestamp', direction: 'desc' },
  };

  protected matchesFilters(record: FuelRecord, query: FuelQuery): boolean {
    if (query.vehicleId && record.vehicleId !== query.vehicleId) return false;
    if (query.driverId && record.driverId !== query.driverId) return false;
    if (query.tripId && record.tripId !== query.tripId) return false;
    if ((query.from || query.to) && !isWithinRange(record.timestamp, query.from ?? null, query.to ?? null)) return false;
    return true;
  }
}
