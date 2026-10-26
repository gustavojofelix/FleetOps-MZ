import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { FuelType, VEHICLE_STATUSES, VEHICLE_TYPES, Vehicle, VehicleStatus, VehicleType } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { emptyToNull, plateNumber, positiveNumber, revealErrors } from '../../../shared/utils/form-utils';
import { VehiclesFacade } from '../vehicles.facade';

const CURRENT_YEAR = 2027;

/** Create / edit form, rendered inside a drawer by the list and detail pages. */
@Component({
  selector: 'app-vehicle-form',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError],
  templateUrl: './vehicle-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleForm {
  readonly vehicle = input<Vehicle | null>(null);
  readonly saved = output<Vehicle>();
  readonly cancelled = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly facade = inject(VehiclesFacade);
  private readonly directory = inject(EntityDirectory);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly clock = inject(ClockService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly types = VEHICLE_TYPES;
  protected readonly statuses = VEHICLE_STATUSES;
  protected readonly fuelTypes: FuelType[] = ['diesel', 'petrol'];
  protected readonly maxYear = CURRENT_YEAR;
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    plateNumber: ['', [Validators.required, plateNumber, (c: AbstractControl) => this.unique(c, 'plateNumber')]],
    fleetNumber: ['', [Validators.required, Validators.maxLength(12), (c: AbstractControl) => this.unique(c, 'fleetNumber')]],
    make: ['', [Validators.required, Validators.maxLength(40)]],
    model: ['', [Validators.required, Validators.maxLength(60)]],
    year: [2024, [Validators.required, Validators.min(1990), Validators.max(CURRENT_YEAR)]],
    type: ['truck_tractor' as VehicleType, Validators.required],
    status: ['available' as VehicleStatus, Validators.required],
    fuelType: ['diesel' as FuelType, Validators.required],
    vin: ['', Validators.maxLength(25)],
    odometerKm: [0, [Validators.required, Validators.min(0)]],
    tankCapacityL: [600, [Validators.required, positiveNumber]],
    expectedConsumptionL100km: [40, [Validators.required, positiveNumber, Validators.max(80)]],
    payloadTonnes: [30, [Validators.required, positiveNumber]],
    assignedDriverId: [''],
    linkedTrailerId: [''],
    acquisitionDate: [''],
    notes: ['', Validators.maxLength(500)],
  });

  private readonly typeValue = toSignal(this.form.controls.type.valueChanges, { initialValue: this.form.controls.type.value });
  protected readonly canLinkTrailer = computed(() => this.typeValue() === 'truck_tractor');

  /** Drivers able to drive; those already assigned elsewhere show which vehicle they leave. */
  protected readonly driverOptions = computed(() =>
    this.directory
      .drivers()
      .filter((d) => d.status !== 'inactive')
      .map((d) => {
        const current = d.assignedVehicleId && d.assignedVehicleId !== this.vehicle()?.id ? this.directory.vehicle(d.assignedVehicleId) : undefined;
        return { id: d.id, label: `${d.firstName} ${d.lastName}`, assignedTo: current?.plateNumber ?? null };
      })
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  protected readonly trailerOptions = computed(() =>
    this.directory
      .trailers()
      .filter((t) => t.status !== 'inactive')
      .map((t) => {
        const current = t.assignedVehicleId && t.assignedVehicleId !== this.vehicle()?.id ? this.directory.vehicle(t.assignedVehicleId) : undefined;
        return { id: t.id, label: `${t.plateNumber} · ${this.i18n.t('trailers.types.' + t.type)}`, assignedTo: current?.plateNumber ?? null };
      }),
  );

  constructor() {
    queueMicrotask(() => this.populate());
  }

  protected isEditing(): boolean {
    return !!this.vehicle();
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const existing = this.vehicle();
    try {
      const saved = await this.facade.save(existing?.id ?? null, {
        plateNumber: value.plateNumber.trim().toUpperCase(),
        fleetNumber: value.fleetNumber.trim().toUpperCase(),
        make: value.make.trim(),
        model: value.model.trim(),
        year: Number(value.year),
        type: value.type,
        status: existing ? existing.status : value.status,
        fuelType: value.fuelType,
        vin: value.vin.trim().toUpperCase(),
        odometerKm: Number(value.odometerKm),
        tankCapacityL: Number(value.tankCapacityL),
        expectedConsumptionL100km: Number(value.expectedConsumptionL100km),
        payloadTonnes: Number(value.payloadTonnes),
        assignedDriverId: emptyToNull(value.assignedDriverId),
        linkedTrailerId: value.type === 'truck_tractor' ? emptyToNull(value.linkedTrailerId) : null,
        acquisitionDate: value.acquisitionDate || this.clock.today(),
        notes: value.notes.trim(),
        statusHistory: existing?.statusHistory ?? [],
      });
      this.saved.emit(saved);
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  private populate(): void {
    const vehicle = this.vehicle();
    if (!vehicle) return;
    this.form.reset({
      plateNumber: vehicle.plateNumber,
      fleetNumber: vehicle.fleetNumber,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      type: vehicle.type,
      status: vehicle.status,
      fuelType: vehicle.fuelType,
      vin: vehicle.vin,
      odometerKm: vehicle.odometerKm,
      tankCapacityL: vehicle.tankCapacityL,
      expectedConsumptionL100km: vehicle.expectedConsumptionL100km,
      payloadTonnes: vehicle.payloadTonnes,
      assignedDriverId: vehicle.assignedDriverId ?? '',
      linkedTrailerId: vehicle.linkedTrailerId ?? '',
      acquisitionDate: vehicle.acquisitionDate,
      notes: vehicle.notes,
    });
  }

  private unique(control: AbstractControl, field: 'plateNumber' | 'fleetNumber'): ValidationErrors | null {
    const value = String(control.value ?? '').trim().toUpperCase();
    if (!value) return null;
    const clash = this.directory.vehicles().some((v) => v.id !== this.vehicle()?.id && v[field].toUpperCase() === value);
    if (!clash) return null;
    return { unique: field === 'plateNumber' ? 'vehicles.validation.plateTaken' : 'vehicles.validation.fleetNumberTaken' };
  }
}
