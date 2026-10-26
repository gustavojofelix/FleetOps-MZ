import { Injectable } from '@angular/core';
import { MockCollection, MockCollectionConfig } from '../data-access/mock-collection';
import { TripQuery, TripRepository } from '../data-access/repositories';
import { isWithinRange } from '../formatting/date-utils';
import { Trip, TripEvent, TripStatus } from '../models';

@Injectable()
export class MockTripsService extends MockCollection<Trip, TripQuery> implements TripRepository {
  protected readonly config: MockCollectionConfig<Trip> = {
    storageKey: 'trips',
    idPrefix: 'trp',
    fixtures: () => import('../mock-data/trips.json').then((m) => m.default as unknown as Trip[]),
    searchFields: (t) => [
      t.reference,
      t.customerReference,
      t.origin.city,
      t.destination.city,
      `${t.origin.city} ${t.destination.city}`,
      t.cargo.containerRef,
      t.cargo.description,
    ],
    defaultSort: { field: 'plannedDeparture', direction: 'desc' },
  };

  protected matchesFilters(trip: Trip, query: TripQuery): boolean {
    if (query.statuses?.length && !query.statuses.includes(trip.status)) return false;
    if (query.customerId && trip.customerId !== query.customerId) return false;
    if (query.vehicleId && trip.vehicleId !== query.vehicleId) return false;
    if (query.driverId && trip.driverId !== query.driverId) return false;
    if (query.trailerId && trip.trailerId !== query.trailerId) return false;
    if (query.routeId && trip.routeId !== query.routeId) return false;
    if ((query.from || query.to) && !isWithinRange(trip.plannedDeparture, query.from ?? null, query.to ?? null)) return false;
    return true;
  }

  async changeStatus(id: string, status: TripStatus, note: string, delayReason: string | null = null): Promise<Trip> {
    const trip = await this.getById(id);
    if (!trip) throw new Error(`Trip ${id} not found`);
    const now = this.clock.now();
    const changes: Partial<Trip> = { status };
    if (status === 'in_transit' && !trip.actualDeparture) changes.actualDeparture = now;
    if (status === 'delivered' && !trip.actualArrival) {
      changes.actualArrival = now;
      changes.actualDistanceKm = trip.actualDistanceKm ?? trip.plannedDistanceKm;
    }
    if (status === 'delayed') changes.delayReason = delayReason ?? trip.delayReason;
    if (status === 'planned' || status === 'preparing') {
      changes.actualDeparture = null;
      changes.actualArrival = null;
    }
    const location = status === 'delivered' || status === 'completed' ? trip.destination.city : trip.origin.city;
    const event: TripEvent = {
      id: `ev-${Date.now().toString(36)}`,
      timestamp: now,
      type: status === 'delayed' ? 'delay' : 'status_change',
      status,
      location,
      note: status === 'delayed' ? (delayReason ?? note) : note,
    };
    changes.timeline = [...trip.timeline, event];
    return this.update(id, changes);
  }

  async addEvent(id: string, event: Omit<TripEvent, 'id'>): Promise<Trip> {
    const trip = await this.getById(id);
    if (!trip) throw new Error(`Trip ${id} not found`);
    const timeline = [...trip.timeline, { ...event, id: `ev-${Date.now().toString(36)}` }].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
    return this.update(id, { timeline });
  }
}
