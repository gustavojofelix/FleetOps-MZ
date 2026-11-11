import { Injectable, inject } from '@angular/core';
import { EntityInput } from '../data-access/query.model';
import { TripRepository } from '../data-access/repositories';
import { canTransition } from '../domain/trip-rules';
import { Trip, TripStatus } from '../models';
import { ClockService } from './clock.service';

export type TripInput = Omit<EntityInput<Trip>, 'timeline' | 'status' | 'actualDeparture' | 'actualArrival' | 'actualDistanceKm' | 'delayReason'>;

/**
 * Trip lifecycle shared by the trips pages and the dispatch board.
 *
 * Vehicle / driver / trailer statuses follow the trip automatically: the database derives them
 * from the active trips in the same transaction (trigger in migration 20261111150000_trips.sql),
 * so nothing here touches those records. Transitions are validated here for a clear message and
 * again by the database.
 */
@Injectable({ providedIn: 'root' })
export class TripWorkflowService {
  private readonly trips = inject(TripRepository);
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
      timeline: [{ id: '', timestamp: now, type: 'created', status: 'planned', location: input.origin.city, note }],
    });
  }

  update(id: string, input: Partial<TripInput>): Promise<Trip> {
    return this.trips.update(id, input);
  }

  /** Changes status (validated against the allowed transitions). */
  async changeStatus(id: string, status: TripStatus, note = '', delayReason: string | null = null): Promise<Trip> {
    const trip = await this.trips.getById(id);
    if (!trip) throw new Error(`Trip ${id} not found`);
    if (!canTransition(trip.status, status)) throw new Error(`Invalid transition ${trip.status} → ${status}`);
    return this.trips.changeStatus(id, status, note, delayReason);
  }

  delete(id: string): Promise<void> {
    return this.trips.delete(id);
  }
}
