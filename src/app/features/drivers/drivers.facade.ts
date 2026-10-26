import { Injectable, inject } from '@angular/core';
import { EntityInput } from '../../core/data-access/query.model';
import { DriverRepository, TripRepository, VehicleRepository } from '../../core/data-access/repositories';
import { Driver, DriverIncident, DriverStatus } from '../../core/models';

export type DriverInput = EntityInput<Driver>;
export type IncidentInput = Omit<DriverIncident, 'id'>;

/**
 * Driver workflows that touch several records. The driver ↔ vehicle assignment is kept
 * symmetric (driver.assignedVehicleId ↔ vehicle.assignedDriverId) here, mirroring
 * VehiclesFacade; on the backend this becomes a transactional RPC.
 */
@Injectable({ providedIn: 'root' })
export class DriversFacade {
  private readonly drivers = inject(DriverRepository);
  private readonly vehicles = inject(VehicleRepository);
  private readonly trips = inject(TripRepository);

  async save(id: string | null, input: DriverInput): Promise<Driver> {
    const previous = id ? await this.drivers.getById(id) : undefined;
    const saved = id ? await this.drivers.update(id, input) : await this.drivers.create(input);
    await this.syncVehicle(saved.id, previous?.assignedVehicleId ?? null, saved.assignedVehicleId);
    return saved;
  }

  /** Manual availability change; marking a driver inactive releases their vehicle. */
  async changeStatus(id: string, status: DriverStatus): Promise<Driver> {
    const driver = await this.drivers.getById(id);
    if (status === 'inactive' && driver?.assignedVehicleId) {
      await this.syncVehicle(id, driver.assignedVehicleId, null);
      return this.drivers.update(id, { status, assignedVehicleId: null });
    }
    return this.drivers.update(id, { status });
  }

  /** Drivers with trip history cannot be deleted (history must stay intact). */
  async linkedTripCount(id: string): Promise<number> {
    return (await this.trips.list({ driverId: id })).total;
  }

  async delete(driver: Driver): Promise<void> {
    await this.syncVehicle(driver.id, driver.assignedVehicleId, null);
    await this.drivers.delete(driver.id);
  }

  async addIncident(driverId: string, incident: IncidentInput): Promise<Driver> {
    const driver = await this.drivers.getById(driverId);
    if (!driver) throw new Error(`Driver ${driverId} not found`);
    const id = `inc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    return this.drivers.update(driverId, { incidents: [...driver.incidents, { ...incident, id }] });
  }

  private async syncVehicle(driverId: string, previous: string | null, next: string | null): Promise<void> {
    if (previous === next) return;
    if (previous) {
      const vehicle = await this.vehicles.getById(previous);
      if (vehicle?.assignedDriverId === driverId) await this.vehicles.update(previous, { assignedDriverId: null });
    }
    if (next) {
      // A vehicle has one primary driver: release it from whoever held it before.
      const others = (await this.drivers.all()).filter((d) => d.id !== driverId && d.assignedVehicleId === next);
      for (const other of others) await this.drivers.update(other.id, { assignedVehicleId: null });
      await this.vehicles.update(next, { assignedDriverId: driverId });
    }
  }
}
