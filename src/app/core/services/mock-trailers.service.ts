import { Injectable } from '@angular/core';
import { MockCollection, MockCollectionConfig } from '../data-access/mock-collection';
import { TrailerQuery, TrailerRepository } from '../data-access/repositories';
import { Trailer } from '../models';

@Injectable()
export class MockTrailersService extends MockCollection<Trailer, TrailerQuery> implements TrailerRepository {
  protected readonly config: MockCollectionConfig<Trailer> = {
    storageKey: 'trailers',
    idPrefix: 't',
    fixtures: () => import('../mock-data/trailers.json').then((m) => m.default as unknown as Trailer[]),
    searchFields: (t) => [t.plateNumber, t.fleetNumber, t.make],
    defaultSort: { field: 'fleetNumber', direction: 'asc' },
  };

  protected matchesFilters(trailer: Trailer, query: TrailerQuery): boolean {
    if (query.status && trailer.status !== query.status) return false;
    if (query.type && trailer.type !== query.type) return false;
    return true;
  }
}
