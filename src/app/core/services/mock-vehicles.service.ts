import { Injectable } from '@angular/core';
import { MockCollection, MockCollectionConfig } from '../data-access/mock-collection';
import { VehicleQuery, VehicleRepository } from '../data-access/repositories';
import { Vehicle, VehicleStatus } from '../models';

@Injectable()
export class MockVehiclesService extends MockCollection<Vehicle, VehicleQuery> implements VehicleRepository {
  protected readonly config: MockCollectionConfig<Vehicle> = {
    storageKey: 'vehicles',
    idPrefix: 'v',
    fixtures: () => import('../mock-data/vehicles.json').then((m) => m.default as unknown as Vehicle[]),
    searchFields: (v) => [v.plateNumber, v.fleetNumber, v.make, v.model, v.vin],
    defaultSort: { field: 'fleetNumber', direction: 'asc' },
  };

  protected matchesFilters(vehicle: Vehicle, query: VehicleQuery): boolean {
    if (query.status && vehicle.status !== query.status) return false;
    if (query.type && vehicle.type !== query.type) return false;
    return true;
  }

  async changeStatus(id: string, status: VehicleStatus, reason: string): Promise<Vehicle> {
    const current = await this.getById(id);
    if (!current) throw new Error(`Vehicle ${id} not found`);
    if (current.status === status) return current;
    return this.update(id, {
      status,
      statusHistory: [...current.statusHistory, { date: this.clock.today(), from: current.status, to: status, reason }],
    });
  }
}
