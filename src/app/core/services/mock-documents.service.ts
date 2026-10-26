import { Injectable } from '@angular/core';
import { MockCollection, MockCollectionConfig } from '../data-access/mock-collection';
import { DocumentQuery, DocumentRepository } from '../data-access/repositories';
import { expiryStatus } from '../domain/document-status';
import { FleetDocument } from '../models';

@Injectable()
export class MockDocumentsService extends MockCollection<FleetDocument, DocumentQuery> implements DocumentRepository {
  protected readonly config: MockCollectionConfig<FleetDocument> = {
    storageKey: 'documents',
    idPrefix: 'doc',
    fixtures: () => import('../mock-data/documents.json').then((m) => m.default as unknown as FleetDocument[]),
    searchFields: (d) => [d.reference, d.title, d.issuer, d.fileName],
    defaultSort: { field: 'expiryDate', direction: 'asc' },
  };

  protected matchesFilters(document: FleetDocument, query: DocumentQuery): boolean {
    if (query.type && document.type !== query.type) return false;
    if (query.entityType && document.entityType !== query.entityType) return false;
    if (query.entityId && document.entityId !== query.entityId) return false;
    if (query.status && expiryStatus(document.expiryDate, this.clock.today()) !== query.status) return false;
    return true;
  }
}
