import { Injectable, inject } from '@angular/core';
import { EntityInput } from '../data-access/query.model';
import { DriverRepository, TrailerRepository, TripRepository, VehicleRepository } from '../data-access/repositories';
import { canTransition } from '../domain/trip-rules';
import { ACTIVE_TRIP_STATUSES, Trip, TripStatus } from '../models';
import { ClockService } from './clock.service';

export type TripInput = Omit<EntityInput<Trip>, 'timeline' | 'status' | 'actualDeparture' | 'actualArrival' | 'actualDistanceKm' | 'delayReason'>;

/**
 * Trip lifecycle shared by the trips pages and the dispatch board. Status changes keep the
 * assigned vehicle, driver and trailer statuses consistent. On the backend this becomes a
 * single transactional operation (RPC) protected by RLS.
 */
@Injectable({ providedIn: 'root' })
export class TripWorkflowService {
  private readonly trips = inject(TripRepository);
  private readonly vehicles = inject(VehicleRepository);
  private readonly drivers = inject(DriverRepository);
  private readonly trailers = inject(TrailerRepository);
  private readonly clock = inject(ClockService);

  async create(input: TripInput, note: string): Promise<Trip> {
    const now = this.clock.now();
    return this.trips.create({
      ...input,
      status: 'planned',
      actualDeparture: null,
      actualArrival: null,
      actualDistanceKm: null,
      delayReason: null,
      timeline: [{ id: `ev-${Date.now().toString(36)}`, timestamp: now, type: 'created', status: 'planned', location: input.origin.city, note }],
    });
  }

  async update(id: string, input: Partial<TripInput>): Promise<Trip> {
    const before = await this.trips.getById(id);
    const updated = await this.trips.update(id, input);
    // If an active trip changes resources, release the old ones and commit the new ones.
    if (before && ACTIVE_TRIP_STATUSES.includes(before.status)) {
      await this.release(before, id);
      await this.commit(updated);
    }
    return updated;
  }

  /** Changes status (validated against allowed transitions) and syncs resource statuses. */
  async changeStatus(id: string, status: TripStatus, note = '', delayReason: string | null = null): Promise<Trip> {
    const trip = await this.trips.getById(id);
    if (!trip) throw new Error(`Trip ${id} not found`);
    if (!canTransition(trip.status, status)) throw new Error(`Invalid transition ${trip.status} → ${status}`);
    const updated = await this.trips.changeStatus(id, status, note, delayReason);
    if (status === 'in_transit' || status === 'delayed') await this.commit(updated);
    if (status === 'preparing' && updated.trailerId) await this.trailers.update(updated.trailerId, { status: 'in_use' });
    if (status === 'delivered' || status === 'completed' || status === 'cancelled' || status === 'planned') await this.release(updated, id);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const trip = await this.trips.getById(id);
    if (trip) await this.release(trip, id);
    await this.trips.delete(id);
  }

  private async commit(trip: Trip): Promise<void> {
    const vehicle = await this.vehicles.getById(trip.vehicleId);
    if (vehicle && vehicle.status !== 'in_transit') await this.vehicles.changeStatus(vehicle.id, 'in_transit', `Viagem ${trip.reference}`);
    const driver = await this.drivers.getById(trip.driverId);
    if (driver && driver.status !== 'on_trip') await this.drivers.update(driver.id, { status: 'on_trip' });
    if (trip.trailerId) await this.trailers.update(trip.trailerId, { status: 'in_use' });
  }

  /** Frees resources unless they are still committed to another active trip. */
  private async release(trip: Trip, excludeTripId: string): Promise<void> {
    const others = (await this.trips.all()).filter((t) => t.id !== excludeTripId && ACTIVE_TRIP_STATUSES.includes(t.status));
    const vehicle = await this.vehicles.getById(trip.vehicleId);
    if (vehicle?.status === 'in_transit' && !others.some((t) => t.vehicleId === vehicle.id)) {
      await this.vehicles.changeStatus(vehicle.id, 'available', `Viagem ${trip.reference} terminada`);
    }
    const driver = await this.drivers.getById(trip.driverId);
    if (driver?.status === 'on_trip' && !others.some((t) => t.driverId === driver.id)) {
      await this.drivers.update(driver.id, { status: 'active' });
    }
    if (trip.trailerId) {
      const trailer = await this.trailers.getById(trip.trailerId);
      if (trailer?.status === 'in_use' && !others.some((t) => t.trailerId === trailer.id)) {
        await this.trailers.update(trailer.id, { status: 'available' });
      }
    }
  }
}
