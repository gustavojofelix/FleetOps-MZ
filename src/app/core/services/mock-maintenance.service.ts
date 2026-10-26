import { Injectable } from '@angular/core';
import { MockCollection, MockCollectionConfig } from '../data-access/mock-collection';
import { MaintenanceQuery, MaintenanceRepository } from '../data-access/repositories';
import { maintenanceDisplayStatus, maintenanceTotalCost } from '../domain/maintenance-rules';
import { isWithinRange } from '../formatting/date-utils';
import { MaintenanceRecord } from '../models';

@Injectable()
export class MockMaintenanceService extends MockCollection<MaintenanceRecord, MaintenanceQuery> implements MaintenanceRepository {
  protected readonly config: MockCollectionConfig<MaintenanceRecord> = {
    storageKey: 'maintenance-records',
    idPrefix: 'm',
    fixtures: () => import('../mock-data/maintenance-records.json').then((m) => m.default as unknown as MaintenanceRecord[]),
    searchFields: (m) => [m.workOrderNumber, m.description, m.workshop],
    defaultSort: { field: 'plannedDate', direction: 'desc' },
  };

  protected matchesFilters(record: MaintenanceRecord, query: MaintenanceQuery): boolean {
    if (query.vehicleId && record.vehicleId !== query.vehicleId) return false;
    if (query.type && record.type !== query.type) return false;
    if (query.displayStatus && maintenanceDisplayStatus(record, this.clock.today()) !== query.displayStatus) return false;
    if ((query.from || query.to) && !isWithinRange(record.plannedDate, query.from ?? null, query.to ?? null)) return false;
    return true;
  }

  protected override sortValue(record: MaintenanceRecord, field: string): unknown {
    if (field === 'totalCost') return maintenanceTotalCost(record);
    return super.sortValue(record, field);
  }
}
