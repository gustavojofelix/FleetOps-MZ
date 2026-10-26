import { Injectable, computed, inject } from '@angular/core';
import { EntityInput } from '../../core/data-access/query.model';
import { MaintenanceRepository, VehicleRepository } from '../../core/data-access/repositories';
import { maintenanceDisplayStatus } from '../../core/domain/maintenance-rules';
import { daysBetween } from '../../core/formatting/date-utils';
import { TranslationService } from '../../core/i18n/translation.service';
import { ACTIVE_TRIP_STATUSES, IsoDate, MaintenanceDisplayStatus, MaintenanceRecord, Trip, Vehicle } from '../../core/models';
import { ClockService } from '../../core/services/clock.service';
import { EntityDirectory } from '../../core/services/entity-directory.service';

export type MaintenanceInput = EntityInput<MaintenanceRecord>;

/** Final figures captured when a work order is closed. */
export interface MaintenanceCompletion {
  completedDate: IsoDate;
  partsCost: number;
  labourCost: number;
  downtimeHours: number;
  nextServiceKm: number | null;
  nextServiceDate: IsoDate | null;
}

/** Raised when a vehicle cannot enter the workshop because it is on an active trip. */
export class VehicleOnTripError extends Error {
  constructor(
    readonly vehicle: Vehicle,
    readonly trip: Trip,
  ) {
    super(`Vehicle ${vehicle.plateNumber} is on trip ${trip.reference}`);
  }
}

/** Result of a mutation that may also change the vehicle status. */
export interface MaintenanceResult {
  record: MaintenanceRecord;
  /** Vehicle moved into maintenance by this action. */
  vehicleInWorkshop: Vehicle | null;
  /** Vehicle released back to available by this action. */
  vehicleReleased: Vehicle | null;
}

export interface UpcomingItem {
  record: MaintenanceRecord;
  status: MaintenanceDisplayStatus;
  /** Days from today to the planned date (negative when overdue). */
  days: number;
}

export interface ServiceForecast {
  vehicleId: string;
  source: MaintenanceRecord;
  dueDate: IsoDate | null;
  /** Kilometres left until the next service (negative when passed). */
  kmLeft: number | null;
}

const FORECAST_WINDOW_DAYS = 45;
const FORECAST_WINDOW_KM = 3000;

/**
 * Work-order workflows. Starting, finishing and cancelling a work order keeps the vehicle
 * status in sync (in maintenance ↔ available); on the backend this becomes a transactional RPC.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceFacade {
  private readonly repository = inject(MaintenanceRepository);
  private readonly vehicles = inject(VehicleRepository);
  private readonly directory = inject(EntityDirectory);
  private readonly clock = inject(ClockService);
  private readonly i18n = inject(TranslationService);

  /** Workshops already used in the data, for the form's suggestions. */
  readonly workshops = computed(() =>
    [...new Set(this.directory.maintenance().map((m) => m.workshop.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  );

  /** Overdue first, then scheduled by planned date. */
  readonly upcoming = computed<UpcomingItem[]>(() => {
    const today = this.clock.today();
    return this.directory
      .maintenance()
      .filter((m) => m.status === 'scheduled')
      .map((record) => ({ record, status: maintenanceDisplayStatus(record, today), days: daysBetween(today, record.plannedDate) }))
      .sort((a, b) => a.record.plannedDate.localeCompare(b.record.plannedDate));
  });

  /**
   * Next services announced on the latest completed job of each vehicle that are close (by date
   * or km) and have no open work order yet.
   */
  readonly forecasts = computed<ServiceForecast[]>(() => {
    const today = this.clock.today();
    const records = this.directory.maintenance();
    const open = new Set(records.filter((m) => m.status === 'scheduled' || m.status === 'in_progress').map((m) => m.vehicleId));
    const latest = new Map<string, MaintenanceRecord>();
    for (const record of records) {
      if (record.status !== 'completed' || (!record.nextServiceDate && !record.nextServiceKm)) continue;
      const current = latest.get(record.vehicleId);
      if (!current || (record.completedDate ?? '') > (current.completedDate ?? '')) latest.set(record.vehicleId, record);
    }
    const result: ServiceForecast[] = [];
    for (const [vehicleId, source] of latest) {
      if (open.has(vehicleId)) continue;
      const vehicle = this.directory.vehicle(vehicleId);
      if (!vehicle || vehicle.status === 'inactive') continue;
      const kmLeft = source.nextServiceKm ? source.nextServiceKm - vehicle.odometerKm : null;
      const daysLeft = source.nextServiceDate ? daysBetween(today, source.nextServiceDate) : null;
      const due = (daysLeft !== null && daysLeft <= FORECAST_WINDOW_DAYS) || (kmLeft !== null && kmLeft <= FORECAST_WINDOW_KM);
      if (due) result.push({ vehicleId, source, dueDate: source.nextServiceDate, kmLeft });
    }
    return result.sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
  });

  /** Next number above the highest existing one for the current year: OT-2026-0166. */
  async nextWorkOrderNumber(): Promise<string> {
    const year = this.clock.today().slice(0, 4);
    const pattern = new RegExp(`^OT-${year}-(\\d+)$`);
    const max = (await this.repository.all()).reduce((highest, record) => {
      const match = pattern.exec(record.workOrderNumber);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    return `OT-${year}-${String(max + 1).padStart(4, '0')}`;
  }

  activeTripFor(vehicleId: string): Trip | null {
    return this.directory.trips().find((trip) => trip.vehicleId === vehicleId && ACTIVE_TRIP_STATUSES.includes(trip.status)) ?? null;
  }

  /** Create / update; status transitions made in the form get the same vehicle side effects. */
  async save(id: string | null, input: MaintenanceInput): Promise<MaintenanceResult> {
    const previous = id ? await this.repository.getById(id) : undefined;
    const entering = input.status === 'in_progress' && (previous?.status !== 'in_progress' || previous.vehicleId !== input.vehicleId);
    if (entering) this.assertNoActiveTrip(input.vehicleId);
    const record = id ? await this.repository.update(id, input) : await this.repository.create(input);
    let vehicleInWorkshop: Vehicle | null = null;
    let vehicleReleased: Vehicle | null = null;
    if (entering) vehicleInWorkshop = await this.enterWorkshop(record);
    if (previous?.status === 'in_progress' && (record.status !== 'in_progress' || previous.vehicleId !== record.vehicleId)) {
      vehicleReleased = await this.releaseVehicle(previous.vehicleId, record);
    }
    return { record, vehicleInWorkshop, vehicleReleased };
  }

  async start(record: MaintenanceRecord): Promise<MaintenanceResult> {
    this.assertNoActiveTrip(record.vehicleId);
    const updated = await this.repository.update(record.id, { status: 'in_progress', startedDate: this.clock.today(), completedDate: null });
    const vehicleInWorkshop = await this.enterWorkshop(updated);
    return { record: updated, vehicleInWorkshop, vehicleReleased: null };
  }

  async complete(record: MaintenanceRecord, completion: MaintenanceCompletion): Promise<MaintenanceResult> {
    const updated = await this.repository.update(record.id, {
      ...completion,
      status: 'completed',
      startedDate: record.startedDate ?? completion.completedDate,
    });
    const vehicleReleased = record.status === 'in_progress' ? await this.releaseVehicle(record.vehicleId, updated) : null;
    return { record: updated, vehicleInWorkshop: null, vehicleReleased };
  }

  async cancel(record: MaintenanceRecord): Promise<MaintenanceResult> {
    const updated = await this.repository.update(record.id, { status: 'cancelled' });
    const vehicleReleased = record.status === 'in_progress' ? await this.releaseVehicle(record.vehicleId, updated) : null;
    return { record: updated, vehicleInWorkshop: null, vehicleReleased };
  }

  async delete(record: MaintenanceRecord): Promise<Vehicle | null> {
    await this.repository.delete(record.id);
    return record.status === 'in_progress' ? this.releaseVehicle(record.vehicleId, record) : null;
  }

  private assertNoActiveTrip(vehicleId: string): void {
    const vehicle = this.directory.vehicle(vehicleId);
    const trip = this.activeTripFor(vehicleId);
    if (vehicle && trip) throw new VehicleOnTripError(vehicle, trip);
  }

  private async enterWorkshop(record: MaintenanceRecord): Promise<Vehicle | null> {
    const vehicle = await this.vehicles.getById(record.vehicleId);
    if (!vehicle || vehicle.status === 'maintenance' || vehicle.status === 'inactive') return null;
    return this.vehicles.changeStatus(
      vehicle.id,
      'maintenance',
      this.i18n.t('maintenance.statusReason.started', { number: record.workOrderNumber }),
    );
  }

  /** Back to available when the vehicle is in maintenance and no other order is still in progress. */
  private async releaseVehicle(vehicleId: string, record: MaintenanceRecord): Promise<Vehicle | null> {
    const vehicle = await this.vehicles.getById(vehicleId);
    if (!vehicle || vehicle.status !== 'maintenance') return null;
    const stillOpen = (await this.repository.list({ vehicleId, displayStatus: 'in_progress' })).items.some(
      (m) => m.id !== record.id,
    );
    if (stillOpen) return null;
    return this.vehicles.changeStatus(
      vehicle.id,
      'available',
      this.i18n.t('maintenance.statusReason.released', { number: record.workOrderNumber }),
    );
  }
}
