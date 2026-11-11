import { Injectable, inject } from '@angular/core';
import { SortSpec } from '../../data-access/query.model';
import {
  ExpenseQuery,
  ExpenseRepository,
  FuelQuery,
  FuelRepository,
  MaintenanceQuery,
  MaintenanceRepository,
} from '../../data-access/repositories';
import { addDays } from '../../formatting/date-utils';
import { ApprovalStatus, Expense, FuelRecord, MaintenanceRecord } from '../../models';
import { ClockService } from '../../services/clock.service';
import { FilterBuilder, SupabaseCollection, eqIf } from '../supabase-collection';

/** Inclusive calendar-date range on a date or timestamp column. */
function dateRange(request: FilterBuilder, column: string, from?: string | null, to?: string | null): FilterBuilder {
  if (from) request = request.gte(column, from);
  if (to) request = request.lt(column, addDays(to, 1));
  return request;
}

@Injectable()
export class SupabaseFuelRepository extends SupabaseCollection<FuelRecord, FuelQuery> implements FuelRepository {
  protected readonly table = 'fuel_records';
  protected readonly searchColumns = ['reference', 'station', 'location'];
  protected readonly defaultSort: SortSpec = { field: 'timestamp', direction: 'desc' };
  protected override readonly sortAliases = { 'totalAmount.amount': 'total_amount_amount', 'pricePerLitre.amount': 'price_per_litre_amount' };
  protected override readonly moneyFields = ['pricePerLitre', 'totalAmount'];
  protected override readonly emptyAsNull = ['driverId', 'tripId', 'receiptFileName'];

  protected applyFilters(request: FilterBuilder, query: FuelQuery): FilterBuilder {
    request = eqIf(eqIf(eqIf(request, 'vehicle_id', query.vehicleId), 'driver_id', query.driverId), 'trip_id', query.tripId);
    return dateRange(request, 'timestamp', query.from, query.to);
  }
}

@Injectable()
export class SupabaseExpenseRepository extends SupabaseCollection<Expense, ExpenseQuery> implements ExpenseRepository {
  protected readonly table = 'expenses';
  protected override readonly select =
    'id, organization_id, reference, date, category, amount_amount, amount_currency, vehicle_id, trip_id, driver_id, vendor, description, payment_method, approval_status, submitted_by_user_id, receipt_file_name, notes, created_at, updated_at';
  protected readonly searchColumns = ['reference', 'vendor', 'description'];
  protected readonly defaultSort: SortSpec = { field: 'date', direction: 'desc' };
  protected override readonly sortAliases = { 'amount.amount': 'amount_amount' };
  protected override readonly moneyFields = ['amount'];
  protected override readonly emptyAsNull = ['vehicleId', 'tripId', 'driverId', 'submittedByUserId', 'receiptFileName'];
  protected override readonly nullAsEmpty = ['submittedByUserId'];

  protected applyFilters(request: FilterBuilder, query: ExpenseQuery): FilterBuilder {
    request = eqIf(eqIf(eqIf(request, 'category', query.category), 'approval_status', query.approvalStatus), 'amount_currency', query.currency);
    request = eqIf(eqIf(request, 'vehicle_id', query.vehicleId), 'trip_id', query.tripId);
    return dateRange(request, 'date', query.from, query.to);
  }

  /** Allowed for owner / admin / finance only (enforced by a database trigger). */
  setApproval(id: string, status: ApprovalStatus): Promise<Expense> {
    return this.update(id, { approvalStatus: status });
  }
}

@Injectable()
export class SupabaseMaintenanceRepository extends SupabaseCollection<MaintenanceRecord, MaintenanceQuery> implements MaintenanceRepository {
  private readonly clock = inject(ClockService);

  protected readonly table = 'maintenance_records';
  protected readonly searchColumns = ['work_order_number', 'description', 'workshop'];
  protected readonly defaultSort: SortSpec = { field: 'plannedDate', direction: 'desc' };
  protected override readonly readOnlyFields = ['totalCost'];
  protected override readonly emptyAsNull = ['startedDate', 'completedDate', 'nextServiceDate', 'nextServiceKm'];

  protected applyFilters(request: FilterBuilder, query: MaintenanceQuery): FilterBuilder {
    request = eqIf(eqIf(request, 'vehicle_id', query.vehicleId), 'type', query.type);
    // "overdue" is derived: scheduled work whose planned date has passed (see maintenance-rules.ts).
    const today = this.clock.today();
    switch (query.displayStatus) {
      case 'overdue':
        request = request.eq('status', 'scheduled').lt('planned_date', today);
        break;
      case 'scheduled':
        request = request.eq('status', 'scheduled').gte('planned_date', today);
        break;
      case null:
      case undefined:
        break;
      default:
        request = request.eq('status', query.displayStatus);
    }
    return dateRange(request, 'planned_date', query.from, query.to);
  }
}
