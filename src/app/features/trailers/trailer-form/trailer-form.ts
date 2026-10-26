import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TRAILER_STATUSES, TRAILER_TYPES, Trailer, TrailerStatus, TrailerType } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { dateOrder, emptyToNull, plateNumber, positiveNumber, revealErrors } from '../../../shared/utils/form-utils';
import { TrailersFacade } from '../trailers.facade';

const CURRENT_YEAR = 2027;

/** Create / edit form, rendered inside a drawer by the list and detail pages. */
@Component({
  selector: 'app-trailer-form',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError],
  templateUrl: './trailer-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrailerForm {
  readonly trailer = input<Trailer | null>(null);
  readonly saved = output<Trailer>();
  readonly cancelled = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly facade = inject(TrailersFacade);
  private readonly directory = inject(EntityDirectory);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly clock = inject(ClockService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly types = TRAILER_TYPES;
  /** "In use" is driven by trips, so it is never chosen by hand. */
  protected readonly statuses = TRAILER_STATUSES.filter((status) => status !== 'in_use');
  protected readonly maxYear = CURRENT_YEAR;
  protected readonly today = this.clock.today();
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group(
    {
      plateNumber: ['', [Validators.required, plateNumber, (c: AbstractControl) => this.unique(c, 'plateNumber')]],
      fleetNumber: ['', [Validators.required, Validators.maxLength(12), (c: AbstractControl) => this.unique(c, 'fleetNumber')]],
      make: ['', [Validators.required, Validators.maxLength(40)]],
      year: [2024, [Validators.required, Validators.min(1980), Validators.max(CURRENT_YEAR)]],
      type: ['skeletal' as TrailerType, Validators.required],
      axles: [3, [Validators.required, Validators.min(2), Validators.max(5)]],
      capacityTonnes: [34, [Validators.required, positiveNumber, Validators.max(120)]],
      capacityLitres: [null as number | null],
      status: ['available' as TrailerStatus, Validators.required],
      assignedVehicleId: [''],
      lastInspectionDate: [this.clock.today(), Validators.required],
      inspectionExpiry: [this.clock.daysFromToday(365), Validators.required],
      notes: ['', Validators.maxLength(500)],
    },
    { validators: dateOrder('lastInspectionDate', 'inspectionExpiry') },
  );

  private readonly typeValue = toSignal(this.form.controls.type.valueChanges, { initialValue: this.form.controls.type.value });
  protected readonly isTanker = computed(() => this.typeValue() === 'tanker');

  /** Truck tractors only; those pulling another trailer show which one would be unlinked. */
  protected readonly vehicleOptions = computed(() => {
    const currentId = this.trailer()?.id;
    const currentVehicle = this.trailer()?.assignedVehicleId;
    return this.directory
      .vehicles()
      .filter((v) => v.type === 'truck_tractor' && (v.status !== 'inactive' || v.id === currentVehicle))
      .map((v) => {
        const linked = v.linkedTrailerId && v.linkedTrailerId !== currentId ? this.directory.trailer(v.linkedTrailerId) : undefined;
        return { id: v.id, label: `${v.plateNumber} · ${v.make} ${v.model}`, linkedTo: linked?.plateNumber ?? null };
      })
      .sort((a, b) => Number(!!a.linkedTo) - Number(!!b.linkedTo) || a.label.localeCompare(b.label));
  });

  constructor() {
    // Tank capacity is only meaningful (and then required) for tankers.
    this.form.controls.type.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((type) => this.applyTankerRules(type));
    queueMicrotask(() => this.populate());
  }

  protected isEditing(): boolean {
    return !!this.trailer();
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const existing = this.trailer();
    try {
      const saved = await this.facade.save(existing?.id ?? null, {
        plateNumber: value.plateNumber.trim().toUpperCase(),
        fleetNumber: value.fleetNumber.trim().toUpperCase(),
        make: value.make.trim(),
        year: Number(value.year),
        type: value.type,
        axles: Number(value.axles),
        capacityTonnes: Number(value.capacityTonnes),
        capacityLitres: value.type === 'tanker' && value.capacityLitres !== null ? Number(value.capacityLitres) : null,
        status: existing ? existing.status : value.status,
        assignedVehicleId: emptyToNull(value.assignedVehicleId),
        lastInspectionDate: value.lastInspectionDate,
        inspectionExpiry: value.inspectionExpiry,
        notes: value.notes.trim(),
      });
      this.saved.emit(saved);
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  private applyTankerRules(type: TrailerType): void {
    const control = this.form.controls.capacityLitres;
    if (type === 'tanker') {
      control.setValidators([Validators.required, positiveNumber, Validators.max(80000)]);
    } else {
      control.clearValidators();
      control.setValue(null, { emitEvent: false });
    }
    control.updateValueAndValidity();
  }

  private populate(): void {
    const trailer = this.trailer();
    if (!trailer) return;
    this.form.reset({
      plateNumber: trailer.plateNumber,
      fleetNumber: trailer.fleetNumber,
      make: trailer.make,
      year: trailer.year,
      type: trailer.type,
      axles: trailer.axles,
      capacityTonnes: trailer.capacityTonnes,
      capacityLitres: trailer.capacityLitres,
      status: trailer.status,
      assignedVehicleId: trailer.assignedVehicleId ?? '',
      lastInspectionDate: trailer.lastInspectionDate,
      inspectionExpiry: trailer.inspectionExpiry,
      notes: trailer.notes,
    });
  }

  private unique(control: AbstractControl, field: 'plateNumber' | 'fleetNumber'): ValidationErrors | null {
    const value = String(control.value ?? '').trim().toUpperCase();
    if (!value) return null;
    const clash = this.directory.trailers().some((t) => t.id !== this.trailer()?.id && t[field].toUpperCase() === value);
    if (!clash) return null;
    return { unique: field === 'plateNumber' ? 'trailers.validation.plateTaken' : 'trailers.validation.fleetNumberTaken' };
  }
}
