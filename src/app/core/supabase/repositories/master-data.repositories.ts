import { Injectable } from '@angular/core';
import { SortSpec } from '../../data-access/query.model';
import {
  CustomerQuery,
  CustomerRepository,
  DriverQuery,
  DriverRepository,
  RouteRepository,
  TrailerQuery,
  TrailerRepository,
  VehicleQuery,
  VehicleRepository,
} from '../../data-access/repositories';
import { Customer, Driver, RouteDefinition, Trailer, Vehicle, VehicleStatus, VehicleStatusChange } from '../../models';
import { toError } from '../supabase-client';
import { FilterBuilder, SupabaseCollection, eqIf, toCamel } from '../supabase-collection';

@Injectable()
export class SupabaseVehicleRepository extends SupabaseCollection<Vehicle, VehicleQuery> implements VehicleRepository {
  protected readonly table = 'vehicles';
  protected override readonly select = '*, vehicle_status_changes(changed_on, from_status, to_status, reason, created_at)';
  protected readonly searchColumns = ['plate_number', 'fleet_number', 'make', 'model', 'vin'];
  protected readonly defaultSort: SortSpec = { field: 'fleetNumber', direction: 'asc' };
  protected override readonly readOnlyFields = ['statusHistory'];
  protected override readonly emptyAsNull = ['acquisitionDate', 'assignedDriverId', 'linkedTrailerId'];
  protected override readonly nullAsEmpty = ['acquisitionDate'];
  protected override readonly embeddedOrder = [{ table: 'vehicle_status_changes', column: 'created_at' }];

  protected applyFilters(request: FilterBuilder, query: VehicleQuery): FilterBuilder {
    return eqIf(eqIf(request, 'status', query.status), 'type', query.type);
  }

  protected override fromRow(row: Record<string, unknown>): Vehicle {
    const { vehicle_status_changes: embedded, ...columns } = row;
    const changes = (embedded ?? []) as Record<string, string>[];
    const vehicle = super.fromRow(columns);
    vehicle.statusHistory = changes.map(
      (c): VehicleStatusChange => ({ date: c['changed_on'], from: c['from_status'] as VehicleStatus, to: c['to_status'] as VehicleStatus, reason: c['reason'] }),
    );
    return vehicle;
  }

  /** Status + history row in one transaction (RPC change_vehicle_status). */
  async changeStatus(id: string, status: VehicleStatus, reason: string): Promise<Vehicle> {
    const { error } = await this.client.rpc('change_vehicle_status', { p_vehicle_id: id, p_status: status, p_reason: reason });
    if (error) throw toError(error);
    this.bump();
    const vehicle = await this.getById(id);
    if (!vehicle) throw new Error(`Vehicle ${id} not found`);
    return vehicle;
  }
}

@Injectable()
export class SupabaseDriverRepository extends SupabaseCollection<Driver, DriverQuery> implements DriverRepository {
  protected readonly table = 'drivers';
  protected readonly searchColumns = ['first_name', 'last_name', 'employee_number', 'phone', 'licence_number', 'city'];
  protected readonly defaultSort: SortSpec = { field: 'lastName', direction: 'asc' };
  protected override readonly sortAliases = { name: 'last_name' };
  protected override readonly emptyAsNull = ['licenceExpiry', 'hireDate', 'assignedVehicleId'];
  protected override readonly nullAsEmpty = ['licenceExpiry', 'hireDate'];

  protected applyFilters(request: FilterBuilder, query: DriverQuery): FilterBuilder {
    return eqIf(request, 'status', query.status);
  }
}

@Injectable()
export class SupabaseTrailerRepository extends SupabaseCollection<Trailer, TrailerQuery> implements TrailerRepository {
  protected readonly table = 'trailers';
  protected readonly searchColumns = ['plate_number', 'fleet_number', 'make'];
  protected readonly defaultSort: SortSpec = { field: 'fleetNumber', direction: 'asc' };
  protected override readonly emptyAsNull = ['lastInspectionDate', 'inspectionExpiry', 'assignedVehicleId', 'capacityLitres'];
  protected override readonly nullAsEmpty = ['lastInspectionDate', 'inspectionExpiry'];

  protected applyFilters(request: FilterBuilder, query: TrailerQuery): FilterBuilder {
    return eqIf(eqIf(request, 'status', query.status), 'type', query.type);
  }
}

@Injectable()
export class SupabaseCustomerRepository extends SupabaseCollection<Customer, CustomerQuery> implements CustomerRepository {
  protected readonly table = 'customers';
  protected readonly searchColumns = ['name', 'legal_name', 'code', 'city', 'contact_name', 'tax_id'];
  protected readonly defaultSort: SortSpec = { field: 'name', direction: 'asc' };
  protected override readonly moneyFields = ['creditLimit', 'outstandingBalance'];

  protected applyFilters(request: FilterBuilder, query: CustomerQuery): FilterBuilder {
    return eqIf(eqIf(eqIf(request, 'status', query.status), 'segment', query.segment), 'country', query.country);
  }
}

@Injectable()
export class SupabaseRouteRepository extends SupabaseCollection<RouteDefinition> implements RouteRepository {
  protected readonly table = 'routes';
  protected readonly searchColumns = [];
  protected readonly defaultSort: SortSpec = { field: 'distanceKm', direction: 'asc' };

  protected applyFilters(request: FilterBuilder): FilterBuilder {
    return request;
  }

  override async all(): Promise<RouteDefinition[]> {
    const { data, error } = await this.client.from('routes').select('id, origin, destination, distance_km, typical_duration_hours, cross_border, border_post');
    if (error) throw toError(error);
    return (data as Record<string, unknown>[]).map(
      (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v])) as unknown as RouteDefinition,
    );
  }
}
