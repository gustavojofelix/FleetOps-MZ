import { Injectable, inject } from '@angular/core';
import { EntityInput } from '../../core/data-access/query.model';
import { DriverRepository, TrailerRepository, TripRepository, VehicleRepository } from '../../core/data-access/repositories';
import { Vehicle, VehicleStatus } from '../../core/models';

export type VehicleInput = EntityInput<Vehicle>;

/**
 * Vehicle workflows that touch several records. Keeping assignments symmetric
 * (vehicle ↔ driver, vehicle ↔ trailer) here keeps components free of business rules;
 * on the backend this becomes a transactional RPC.
 */
@Injectable({ providedIn: 'root' })
export class VehiclesFacade {
  private readonly vehicles = inject(VehicleRepository);
  private readonly drivers = inject(DriverRepository);
  private readonly trailers = inject(TrailerRepository);
  private readonly trips = inject(TripRepository);

  async save(id: string | null, input: VehicleInput): Promise<Vehicle> {
    const previous = id ? await this.vehicles.getById(id) : undefined;
    const saved = id ? await this.vehicles.update(id, input) : await this.vehicles.create(input);
    await this.syncDriver(saved.id, previous?.assignedDriverId ?? null, saved.assignedDriverId);
    await this.syncTrailer(saved.id, previous?.linkedTrailerId ?? null, saved.linkedTrailerId);
    return saved;
  }

  changeStatus(id: string, status: VehicleStatus, reason: string): Promise<Vehicle> {
    return this.vehicles.changeStatus(id, status, reason);
  }

  /** Vehicles with trip history cannot be deleted (history must stay intact). */
  async linkedTripCount(id: string): Promise<number> {
    return (await this.trips.list({ vehicleId: id })).total;
  }

  async delete(vehicle: Vehicle): Promise<void> {
    await this.syncDriver(vehicle.id, vehicle.assignedDriverId, null);
    await this.syncTrailer(vehicle.id, vehicle.linkedTrailerId, null);
    await this.vehicles.delete(vehicle.id);
  }

  private async syncDriver(vehicleId: string, previous: string | null, next: string | null): Promise<void> {
    if (previous === next) return;
    if (previous) {
      const driver = await this.drivers.getById(previous);
      if (driver?.assignedVehicleId === vehicleId) await this.drivers.update(previous, { assignedVehicleId: null });
    }
    if (next) {
      // A driver has one primary vehicle: release it from any other vehicle first.
      const others = (await this.vehicles.all()).filter((v) => v.id !== vehicleId && v.assignedDriverId === next);
      for (const other of others) await this.vehicles.update(other.id, { assignedDriverId: null });
      await this.drivers.update(next, { assignedVehicleId: vehicleId });
    }
  }

  private async syncTrailer(vehicleId: string, previous: string | null, next: string | null): Promise<void> {
    if (previous === next) return;
    if (previous) {
      const trailer = await this.trailers.getById(previous);
      if (trailer?.assignedVehicleId === vehicleId) await this.trailers.update(previous, { assignedVehicleId: null });
    }
    if (next) {
      const others = (await this.vehicles.all()).filter((v) => v.id !== vehicleId && v.linkedTrailerId === next);
      for (const other of others) await this.vehicles.update(other.id, { linkedTrailerId: null });
      await this.trailers.update(next, { assignedVehicleId: vehicleId });
    }
  }
}
