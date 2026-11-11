import { Injectable, inject } from '@angular/core';
import { EntityInput, SortSpec } from '../../data-access/query.model';
import { DriverRepository, TrailerRepository, TripQuery, TripRepository, VehicleRepository } from '../../data-access/repositories';
import { addDays } from '../../formatting/date-utils';
import { Trip, TripEvent, TripEventType, TripStatus } from '../../models';
import { toError } from '../supabase-client';
import { FilterBuilder, SupabaseCollection, eqIf } from '../supabase-collection';

/**
 * Trips on Supabase. Status changes and creation go through RPCs (trip + timeline event in one
 * transaction); vehicle / driver / trailer statuses are kept in sync by a database trigger, so
 * after any trip mutation those repositories are told to refetch.
 */
@Injectable()
export class SupabaseTripRepository extends SupabaseCollection<Trip, TripQuery> implements TripRepository {
  private readonly resources = [inject(VehicleRepository), inject(DriverRepository), inject(TrailerRepository)];

  protected readonly table = 'trips';
  protected override readonly select = '*, trip_events(id, occurred_at, type, status, location, note)';
  protected readonly searchColumns = [
    'reference',
    'customer_reference',
    'origin->>city',
    'destination->>city',
    'cargo->>containerRef',
    'cargo->>description',
  ];
  protected readonly defaultSort: SortSpec = { field: 'plannedDeparture', direction: 'desc' };
  protected override readonly sortAliases = { 'revenue.amount': 'revenue_amount' };
  protected override readonly moneyFields = ['revenue'];
  protected override readonly readOnlyFields = ['timeline'];
  protected override readonly emptyAsNull = ['trailerId', 'routeId'];
  protected override readonly embeddedOrder = [{ table: 'trip_events', column: 'occurred_at' }];

  protected applyFilters(request: FilterBuilder, query: TripQuery): FilterBuilder {
    if (query.statuses?.length) request = request.in('status', query.statuses);
    for (const [column, value] of [
      ['customer_id', query.customerId],
      ['vehicle_id', query.vehicleId],
      ['driver_id', query.driverId],
      ['trailer_id', query.trailerId],
      ['route_id', query.routeId],
    ] as const) {
      request = eqIf(request, column, value);
    }
    if (query.from) request = request.gte('planned_departure', query.from);
    if (query.to) request = request.lt('planned_departure', addDays(query.to, 1));
    return request;
  }

  protected override fromRow(row: Record<string, unknown>): Trip {
    const { trip_events: embedded, ...columns } = row;
    const trip = super.fromRow(columns);
    trip.timeline = ((embedded ?? []) as Record<string, unknown>[]).map(
      (e): TripEvent => ({
        id: e['id'] as string,
        timestamp: e['occurred_at'] as string,
        type: e['type'] as TripEventType,
        status: (e['status'] as TripStatus | null) ?? null,
        location: (e['location'] as string) ?? '',
        note: (e['note'] as string) ?? '',
      }),
    );
    return trip;
  }

  /** Planned trip + "created" event (RPC create_trip). The note comes from the first timeline event. */
  override async create(input: EntityInput<Trip>): Promise<Trip> {
    const row = { ...this.toRow(input), organization_id: this.organization.organizationId() };
    const { data, error } = await this.client.rpc('create_trip', { p_trip: row, p_note: input.timeline?.[0]?.note ?? '' });
    if (error) throw toError(error);
    return this.afterMutation(data as string);
  }

  override async update(id: string, changes: Partial<EntityInput<Trip>>): Promise<Trip> {
    const trip = await super.update(id, changes);
    this.refreshResources();
    return trip;
  }

  override async delete(id: string): Promise<void> {
    await super.delete(id);
    this.refreshResources();
  }

  async changeStatus(id: string, status: TripStatus, note: string, delayReason: string | null = null): Promise<Trip> {
    const { error } = await this.client.rpc('change_trip_status', { p_trip_id: id, p_status: status, p_note: note, p_delay_reason: delayReason });
    if (error) throw toError(error);
    return this.afterMutation(id);
  }

  async addEvent(id: string, event: Omit<TripEvent, 'id'>): Promise<Trip> {
    const { error } = await this.client.from('trip_events').insert({
      organization_id: this.organization.organizationId(),
      trip_id: id,
      occurred_at: event.timestamp,
      type: event.type,
      status: event.status,
      location: event.location,
      note: event.note,
    });
    if (error) throw toError(error);
    return this.afterMutation(id);
  }

  private async afterMutation(id: string): Promise<Trip> {
    this.bump();
    this.refreshResources();
    const trip = await this.getById(id);
    if (!trip) throw new Error(`Trip ${id} not found`);
    return trip;
  }

  /** The database trigger may have changed vehicle / driver / trailer statuses. */
  private refreshResources(): void {
    for (const repository of this.resources) {
      if (repository instanceof SupabaseCollection) repository.markChanged();
    }
  }
}
