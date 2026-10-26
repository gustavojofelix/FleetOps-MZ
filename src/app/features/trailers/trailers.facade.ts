import { Injectable, inject } from '@angular/core';
import { EntityInput } from '../../core/data-access/query.model';
import { TrailerRepository, TripRepository, VehicleRepository } from '../../core/data-access/repositories';
import { Trailer, TrailerStatus } from '../../core/models';

export type TrailerInput = EntityInput<Trailer>;

/**
 * Trailer workflows that touch several records. The trailer ↔ tractor link is kept
 * symmetric (trailer.assignedVehicleId ↔ vehicle.linkedTrailerId) here, mirroring
 * VehiclesFacade; on the backend this becomes a transactional RPC.
 */
@Injectable({ providedIn: 'root' })
export class TrailersFacade {
  private readonly trailers = inject(TrailerRepository);
  private readonly vehicles = inject(VehicleRepository);
  private readonly trips = inject(TripRepository);

  async save(id: string | null, input: TrailerInput): Promise<Trailer> {
    const previous = id ? await this.trailers.getById(id) : undefined;
    const saved = id ? await this.trailers.update(id, input) : await this.trailers.create(input);
    await this.syncVehicle(saved.id, previous?.assignedVehicleId ?? null, saved.assignedVehicleId);
    return saved;
  }

  changeStatus(id: string, status: TrailerStatus): Promise<Trailer> {
    return this.trailers.update(id, { status });
  }

  /** Trailers used on trips cannot be deleted (history must stay intact). */
  async linkedTripCount(id: string): Promise<number> {
    return (await this.trips.list({ trailerId: id })).total;
  }

  async delete(trailer: Trailer): Promise<void> {
    await this.syncVehicle(trailer.id, trailer.assignedVehicleId, null);
    await this.trailers.delete(trailer.id);
  }

  private async syncVehicle(trailerId: string, previous: string | null, next: string | null): Promise<void> {
    if (previous === next) return;
    if (previous) {
      const vehicle = await this.vehicles.getById(previous);
      if (vehicle?.linkedTrailerId === trailerId) await this.vehicles.update(previous, { linkedTrailerId: null });
    }
    if (next) {
      // A tractor pulls one trailer: unlink whichever trailer it pulled before.
      const others = (await this.trailers.all()).filter((t) => t.id !== trailerId && t.assignedVehicleId === next);
      for (const other of others) await this.trailers.update(other.id, { assignedVehicleId: null });
      await this.vehicles.update(next, { linkedTrailerId: trailerId });
    }
  }
}
