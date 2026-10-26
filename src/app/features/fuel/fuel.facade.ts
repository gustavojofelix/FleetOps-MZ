import { Injectable, inject } from '@angular/core';
import { EntityInput } from '../../core/data-access/query.model';
import { FuelRepository, VehicleRepository } from '../../core/data-access/repositories';
import { FuelRecord } from '../../core/models';
import { nextReference } from './fuel-calculations';

export type FuelInput = EntityInput<FuelRecord>;

const REFERENCE_PREFIX = 'ABS';

/**
 * Fuel record workflows. Saving also advances the vehicle odometer when the reading is the
 * newest known one; on the backend this becomes a single transactional RPC.
 */
@Injectable({ providedIn: 'root' })
export class FuelFacade {
  private readonly fuel = inject(FuelRepository);
  private readonly vehicles = inject(VehicleRepository);

  async save(id: string | null, input: FuelInput): Promise<FuelRecord> {
    const saved = id
      ? await this.fuel.update(id, input)
      : await this.fuel.create({ ...input, reference: input.reference || (await this.nextReference()) });
    const vehicle = await this.vehicles.getById(saved.vehicleId);
    if (vehicle && saved.odometerKm > vehicle.odometerKm) {
      await this.vehicles.update(vehicle.id, { odometerKm: saved.odometerKm });
    }
    return saved;
  }

  delete(id: string): Promise<void> {
    return this.fuel.delete(id);
  }

  private async nextReference(): Promise<string> {
    const all = await this.fuel.all();
    return nextReference(
      all.map((record) => record.reference),
      REFERENCE_PREFIX,
    );
  }
}
