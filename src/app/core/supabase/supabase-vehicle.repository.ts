import { Injectable, inject, signal } from '@angular/core';
import { EntityInput, PagedResult } from '../data-access/query.model';
import { VehicleQuery, VehicleRepository } from '../data-access/repositories';
import { FuelType, Vehicle, VehicleStatus, VehicleStatusChange, VehicleType } from '../models';
import { CurrentOrganization } from './current-organization.service';
import { SUPABASE, isUuid, toError } from './supabase-client';

/** Row shape of `public.vehicles` (+ embedded history), see supabase/migrations. */
interface VehicleRow {
  id: string;
  organization_id: string;
  plate_number: string;
  fleet_number: string;
  make: string;
  model: string;
  year: number | null;
  type: VehicleType;
  status: VehicleStatus;
  fuel_type: FuelType;
  vin: string;
  odometer_km: number;
  tank_capacity_l: number | string;
  expected_consumption_l100km: number | string;
  payload_tonnes: number | string;
  assigned_driver_id: string | null;
  linked_trailer_id: string | null;
  acquisition_date: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  vehicle_status_changes?: StatusChangeRow[];
}

interface StatusChangeRow {
  changed_on: string;
  from_status: VehicleStatus;
  to_status: VehicleStatus;
  reason: string;
  created_at: string;
}

const SELECT = '*, vehicle_status_changes(changed_on, from_status, to_status, reason, created_at)';

/** Frontend sort fields → columns. Anything else falls back to the default order. */
const SORT_COLUMNS: Record<string, string> = {
  plateNumber: 'plate_number',
  fleetNumber: 'fleet_number',
  make: 'make',
  model: 'model',
  year: 'year',
  type: 'type',
  status: 'status',
  odometerKm: 'odometer_km',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

/** Frontend field → column, for inserts and partial updates. */
const COLUMNS: Partial<Record<keyof EntityInput<Vehicle>, keyof VehicleRow>> = {
  plateNumber: 'plate_number',
  fleetNumber: 'fleet_number',
  make: 'make',
  model: 'model',
  year: 'year',
  type: 'type',
  status: 'status',
  fuelType: 'fuel_type',
  vin: 'vin',
  odometerKm: 'odometer_km',
  tankCapacityL: 'tank_capacity_l',
  expectedConsumptionL100km: 'expected_consumption_l100km',
  payloadTonnes: 'payload_tonnes',
  assignedDriverId: 'assigned_driver_id',
  linkedTrailerId: 'linked_trailer_id',
  acquisitionDate: 'acquisition_date',
  notes: 'notes',
  // statusHistory is written only by the change_vehicle_status RPC.
};

/**
 * VehicleRepository backed by Supabase (`public.vehicles`). Tenant isolation and write
 * permissions are enforced by RLS; this class only maps rows and queries.
 */
@Injectable()
export class SupabaseVehicleRepository extends VehicleRepository {
  private readonly client = inject(SUPABASE);
  private readonly organization = inject(CurrentOrganization);
  private readonly version = signal(0);

  readonly changes = this.version.asReadonly();

  async list(query: VehicleQuery = {}): Promise<PagedResult<Vehicle>> {
    let request = this.client.from('vehicles').select(SELECT, { count: 'exact' });
    if (query.status) request = request.eq('status', query.status);
    if (query.type) request = request.eq('type', query.type);

    const term = sanitizeSearch(query.search);
    if (term) {
      const pattern = `%${term}%`;
      request = request.or(['plate_number', 'fleet_number', 'make', 'model', 'vin'].map((c) => `${c}.ilike.${pattern}`).join(','));
    }

    const column = (query.sort && SORT_COLUMNS[query.sort.field]) ?? 'fleet_number';
    const ascending = query.sort ? query.sort.direction === 'asc' : true;
    request = request.order(column, { ascending }).order('id').order('created_at', { referencedTable: 'vehicle_status_changes' });

    const page = Math.max(1, query.page ?? 1);
    if (query.pageSize) {
      const from = (page - 1) * query.pageSize;
      request = request.range(from, from + query.pageSize - 1);
    }

    const { data, error, count } = await request;
    if (error) throw toError(error);
    const items = (data as VehicleRow[]).map(fromRow);
    const total = count ?? items.length;
    return { items, total, page: query.pageSize ? page : 1, pageSize: query.pageSize ?? total };
  }

  async all(): Promise<Vehicle[]> {
    const { data, error } = await this.client
      .from('vehicles')
      .select(SELECT)
      .order('fleet_number')
      .order('created_at', { referencedTable: 'vehicle_status_changes' });
    if (error) throw toError(error);
    return (data as VehicleRow[]).map(fromRow);
  }

  async getById(id: string): Promise<Vehicle | undefined> {
    if (!isUuid(id)) return undefined;
    const { data, error } = await this.client
      .from('vehicles')
      .select(SELECT)
      .eq('id', id)
      .order('created_at', { referencedTable: 'vehicle_status_changes' })
      .maybeSingle();
    if (error) throw toError(error);
    return data ? fromRow(data as VehicleRow) : undefined;
  }

  async create(input: EntityInput<Vehicle>): Promise<Vehicle> {
    const row = { ...toRow(input), organization_id: this.organization.organizationId() };
    const { data, error } = await this.client.from('vehicles').insert(row).select(SELECT).single();
    if (error) throw toError(error);
    this.bump();
    return fromRow(data as VehicleRow);
  }

  async update(id: string, changes: Partial<EntityInput<Vehicle>>): Promise<Vehicle> {
    const { data, error } = await this.client.from('vehicles').update(toRow(changes)).eq('id', id).select(SELECT).single();
    if (error) throw toError(error);
    this.bump();
    return fromRow(data as VehicleRow);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.client.from('vehicles').delete().eq('id', id);
    if (error) throw toError(error);
    this.bump();
  }

  async changeStatus(id: string, status: VehicleStatus, reason: string): Promise<Vehicle> {
    const { error } = await this.client.rpc('change_vehicle_status', { p_vehicle_id: id, p_status: status, p_reason: reason });
    if (error) throw toError(error);
    this.bump();
    const vehicle = await this.getById(id);
    if (!vehicle) throw new Error(`Vehicle ${id} not found`);
    return vehicle;
  }

  /** Demo-only operation: real data is never reset from the browser. */
  reset(): void {}

  private bump(): void {
    this.version.update((v) => v + 1);
  }
}

function fromRow(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    organizationId: row.organization_id,
    plateNumber: row.plate_number,
    fleetNumber: row.fleet_number,
    make: row.make,
    model: row.model,
    year: row.year ?? 0,
    type: row.type,
    status: row.status,
    fuelType: row.fuel_type,
    vin: row.vin,
    odometerKm: row.odometer_km,
    tankCapacityL: Number(row.tank_capacity_l),
    expectedConsumptionL100km: Number(row.expected_consumption_l100km),
    payloadTonnes: Number(row.payload_tonnes),
    assignedDriverId: row.assigned_driver_id,
    linkedTrailerId: row.linked_trailer_id,
    acquisitionDate: row.acquisition_date ?? '',
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statusHistory: (row.vehicle_status_changes ?? []).map(
      (change): VehicleStatusChange => ({ date: change.changed_on, from: change.from_status, to: change.to_status, reason: change.reason }),
    ),
  };
}

function toRow(input: Partial<EntityInput<Vehicle>>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(COLUMNS) as [keyof EntityInput<Vehicle>, string][]) {
    if (!(field in input)) continue;
    let value: unknown = input[field];
    if (field === 'year') value = value || null;
    if (field === 'acquisitionDate') value = value || null;
    // Drivers and trailers are still mock records (ids like "d-001"); they cannot be stored yet.
    if (field === 'assignedDriverId' || field === 'linkedTrailerId') value = isUuid(value as string | null) ? value : null;
    row[column] = value;
  }
  return row;
}

/** Characters with meaning in PostgREST `or=(…)` / ilike filters are dropped from user search. */
function sanitizeSearch(search: string | undefined): string {
  return (search ?? '').replace(/[,()*%\\"]/g, ' ').trim();
}
