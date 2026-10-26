import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { maintenanceTotalCost } from '../../../core/domain/maintenance-rules';
import { ACTIVE_CURRENCIES } from '../../../core/formatting/currency';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import {
  CurrencyCode,
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
  MaintenanceRecord,
  MaintenanceStatus,
  MaintenanceType,
} from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { Icon } from '../../../shared/ui/icon/icon';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { revealErrors } from '../../../shared/utils/form-utils';
import { MaintenanceFacade, MaintenanceInput, MaintenanceResult, VehicleOnTripError } from '../maintenance.facade';

/** Values used to pre-fill a new work order (e.g. "schedule" from a service forecast). */
export type MaintenancePreset = Partial<Pick<MaintenanceInput, 'vehicleId' | 'type' | 'description' | 'workshop' | 'plannedDate'>>;

const optionalNumber = (value: number | string | null): number | null =>
  value === null || value === '' || Number.isNaN(Number(value)) ? null : Number(value);

/** Create / edit work order, rendered inside a drawer by the maintenance page. */
@Component({
  selector: 'app-maintenance-form',
  imports: [ReactiveFormsModule, TranslatePipe, ...FORMAT_PIPES, FieldError, Icon],
  templateUrl: './maintenance-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaintenanceForm {
  readonly record = input<MaintenanceRecord | null>(null);
  readonly preset = input<MaintenancePreset | null>(null);
  readonly saved = output<MaintenanceResult>();
  readonly cancelled = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly facade = inject(MaintenanceFacade);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly clock = inject(ClockService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly directory = inject(EntityDirectory);

  protected readonly types = MAINTENANCE_TYPES;
  protected readonly statuses = MAINTENANCE_STATUSES;
  protected readonly currencies = ACTIVE_CURRENCIES;
  protected readonly workshops = this.facade.workshops;
  protected readonly saving = signal(false);
  protected readonly workOrderNumber = signal('');

  protected readonly form = this.fb.group({
    vehicleId: ['', Validators.required],
    type: ['preventive' as MaintenanceType, Validators.required],
    description: ['', [Validators.required, Validators.maxLength(200)]],
    workshop: ['', [Validators.required, Validators.maxLength(80)]],
    odometerKm: [0, [Validators.required, Validators.min(0)]],
    plannedDate: [this.clock.today(), Validators.required],
    status: ['scheduled' as MaintenanceStatus, Validators.required],
    startedDate: ['', (c: AbstractControl) => this.requiredFor(c, ['in_progress', 'completed'])],
    completedDate: ['', [(c: AbstractControl) => this.requiredFor(c, ['completed']), (c: AbstractControl) => this.notBeforeStart(c)]],
    currency: ['MZN' as CurrencyCode, Validators.required],
    partsCost: [0, [Validators.required, Validators.min(0)]],
    labourCost: [0, [Validators.required, Validators.min(0)]],
    downtimeHours: [0, [Validators.required, Validators.min(0), Validators.max(2000)]],
    nextServiceKm: [null as number | null, (c: AbstractControl) => this.nextKmAfterOdometer(c)],
    nextServiceDate: ['', (c: AbstractControl) => this.nextDateAfterWork(c)],
    notes: ['', Validators.maxLength(500)],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly status = computed(() => this.value().status ?? 'scheduled');
  protected readonly total = computed(() =>
    maintenanceTotalCost({ partsCost: Number(this.value().partsCost) || 0, labourCost: Number(this.value().labourCost) || 0 }),
  );
  protected readonly currency = computed<CurrencyCode>(() => this.value().currency ?? 'MZN');
  protected readonly showStarted = computed(() => this.status() === 'in_progress' || this.status() === 'completed');
  protected readonly showCompleted = computed(() => this.status() === 'completed');

  protected readonly vehicleOptions = computed(() =>
    this.directory
      .vehicles()
      .map((v) => ({ id: v.id, label: `${v.plateNumber} · ${v.fleetNumber} · ${v.make} ${v.model}`, inactive: v.status === 'inactive' }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  /** Warns before saving that the vehicle cannot enter the workshop. */
  protected readonly blockingTrip = computed(() => {
    const value = this.value();
    if (value.status !== 'in_progress' || !value.vehicleId) return null;
    const existing = this.record();
    if (existing?.status === 'in_progress' && existing.vehicleId === value.vehicleId) return null;
    return this.facade.activeTripFor(value.vehicleId);
  });

  constructor() {
    const controls = this.form.controls;
    const revalidate = (...targets: AbstractControl[]) => targets.forEach((target) => target.updateValueAndValidity({ emitEvent: false }));
    controls.status.valueChanges.pipe(takeUntilDestroyed()).subscribe((status) => {
      // Sensible defaults when work starts or ends from the form.
      const today = this.clock.today();
      if ((status === 'in_progress' || status === 'completed') && !controls.startedDate.value) controls.startedDate.setValue(today);
      if (status === 'completed' && !controls.completedDate.value) controls.completedDate.setValue(today);
      revalidate(controls.startedDate, controls.completedDate);
    });
    controls.startedDate.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => revalidate(controls.completedDate));
    controls.odometerKm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => revalidate(controls.nextServiceKm));
    controls.plannedDate.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => revalidate(controls.nextServiceDate));
    controls.completedDate.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => revalidate(controls.nextServiceDate));
    controls.vehicleId.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => this.onVehicleChange(id));
    queueMicrotask(() => void this.populate());
  }

  protected isEditing(): boolean {
    return !!this.record();
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const status = value.status;
    const keepsStart = status === 'in_progress' || status === 'completed';
    try {
      const result = await this.facade.save(this.record()?.id ?? null, {
        workOrderNumber: this.workOrderNumber(),
        vehicleId: value.vehicleId,
        type: value.type,
        status,
        description: value.description.trim(),
        workshop: value.workshop.trim(),
        odometerKm: Number(value.odometerKm),
        plannedDate: value.plannedDate,
        startedDate: keepsStart ? value.startedDate || null : null,
        completedDate: status === 'completed' ? value.completedDate || null : null,
        currency: value.currency,
        partsCost: Number(value.partsCost) || 0,
        labourCost: Number(value.labourCost) || 0,
        downtimeHours: Number(value.downtimeHours) || 0,
        nextServiceKm: optionalNumber(value.nextServiceKm),
        nextServiceDate: value.nextServiceDate || null,
        notes: value.notes.trim(),
      });
      this.saved.emit(result);
    } catch (error) {
      if (error instanceof VehicleOnTripError) {
        this.toast.warning(this.i18n.t('maintenance.toasts.blockedByTrip', { plate: error.vehicle.plateNumber, trip: error.trip.reference }));
      } else {
        this.toast.error(this.i18n.t('common.toasts.error'));
      }
    } finally {
      this.saving.set(false);
    }
  }

  private async populate(): Promise<void> {
    const record = this.record();
    if (record) {
      this.workOrderNumber.set(record.workOrderNumber);
      this.form.reset(
        {
          vehicleId: record.vehicleId,
          type: record.type,
          description: record.description,
          workshop: record.workshop,
          odometerKm: record.odometerKm,
          plannedDate: record.plannedDate,
          status: record.status,
          startedDate: record.startedDate ?? '',
          completedDate: record.completedDate ?? '',
          currency: record.currency,
          partsCost: record.partsCost,
          labourCost: record.labourCost,
          downtimeHours: record.downtimeHours,
          nextServiceKm: record.nextServiceKm,
          nextServiceDate: record.nextServiceDate ?? '',
          notes: record.notes,
      });
      return;
    }
    const preset = this.preset();
    if (preset) {
      this.form.patchValue({
        vehicleId: preset.vehicleId ?? '',
        type: preset.type ?? 'preventive',
        description: preset.description ?? '',
        workshop: preset.workshop ?? '',
        plannedDate: preset.plannedDate ?? this.clock.today(),
      });
    }
    this.workOrderNumber.set(await this.facade.nextWorkOrderNumber());
  }

  private onVehicleChange(id: string): void {
    const vehicle = this.directory.vehicle(id);
    if (!vehicle) return;
    const odometer = this.form.controls.odometerKm;
    // Keep the stored or user-entered odometer; otherwise follow the selected vehicle.
    if (this.record()?.vehicleId === id || odometer.dirty) return;
    odometer.setValue(vehicle.odometerKm);
  }

  private requiredFor(control: AbstractControl, statuses: MaintenanceStatus[]): ValidationErrors | null {
    const status = control.parent?.get('status')?.value as MaintenanceStatus | undefined;
    if (!status || !statuses.includes(status)) return null;
    return control.value ? null : { required: true };
  }

  private notBeforeStart(control: AbstractControl): ValidationErrors | null {
    const started = control.parent?.get('startedDate')?.value as string | undefined;
    const completed = control.value as string;
    if (!started || !completed || completed >= started) return null;
    return { order: 'maintenance.validation.completedBeforeStarted' };
  }

  private nextKmAfterOdometer(control: AbstractControl): ValidationErrors | null {
    const value = optionalNumber(control.value as number | null);
    if (value === null) return null;
    const odometer = Number(control.parent?.get('odometerKm')?.value ?? 0);
    return value > odometer ? null : { nextKm: 'maintenance.validation.nextServiceKm' };
  }

  private nextDateAfterWork(control: AbstractControl): ValidationErrors | null {
    const value = control.value as string;
    if (!value) return null;
    const reference = (control.parent?.get('completedDate')?.value as string) || (control.parent?.get('plannedDate')?.value as string);
    if (!reference || value > reference) return null;
    return { nextDate: 'maintenance.validation.nextServiceDate' };
  }
}
