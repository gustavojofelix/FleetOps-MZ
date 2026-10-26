import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { analyseFuelRecord } from '../../../core/domain/fuel-analysis';
import { ACTIVE_CURRENCIES } from '../../../core/formatting/currency';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '../../../core/formatting/date-utils';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CurrencyCode, FuelRecord } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { Icon } from '../../../shared/ui/icon/icon';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { emptyToNull, positiveNumber, revealErrors } from '../../../shared/utils/form-utils';
import { fuelTotal, previousFuelRecord } from '../fuel-calculations';
import { FuelFacade } from '../fuel.facade';

/** Pre-filled values for a new record (e.g. when opened from a trip context). */
export interface FuelFormDefaults {
  vehicleId?: string | null;
  driverId?: string | null;
  tripId?: string | null;
}

export interface FuelSaveResult {
  record: FuelRecord;
  created: boolean;
  warningCount: number;
}

interface LastReading {
  km: number;
  date: string | null;
  source: 'record' | 'vehicle';
}

/** Create / edit form for a fuel record, rendered inside a drawer by the fuel page. */
@Component({
  selector: 'app-fuel-form',
  imports: [ReactiveFormsModule, TranslatePipe, ...FORMAT_PIPES, FieldError, Icon],
  templateUrl: './fuel-form.html',
  styleUrl: './fuel-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FuelForm {
  readonly record = input<FuelRecord | null>(null);
  readonly defaults = input<FuelFormDefaults | null>(null);
  readonly saved = output<FuelSaveResult>();
  readonly cancelled = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly facade = inject(FuelFacade);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly clock = inject(ClockService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly directory = inject(EntityDirectory);

  protected readonly currencies = ACTIVE_CURRENCIES;
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    vehicleId: ['', Validators.required],
    driverId: [''],
    tripId: [''],
    timestamp: ['', Validators.required],
    odometerKm: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    litres: this.fb.control<number | null>(null, [Validators.required, positiveNumber, Validators.max(5000)]),
    pricePerLitre: this.fb.control<number | null>(null, [Validators.required, positiveNumber]),
    currency: ['MZN' as CurrencyCode, Validators.required],
    fullTank: [true],
    station: ['', [Validators.required, Validators.maxLength(80)]],
    location: ['', [Validators.required, Validators.maxLength(80)]],
    receiptFileName: [''],
    notes: ['', Validators.maxLength(500)],
  });

  protected readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  protected readonly vehicle = computed(() => this.directory.vehicle(this.value().vehicleId));
  protected readonly total = computed(() => fuelTotal(this.value().litres, this.value().pricePerLitre));

  protected readonly vehicleOptions = computed(() => {
    const currentId = this.record()?.vehicleId;
    return this.directory
      .vehicles()
      .filter((v) => v.status !== 'inactive' || v.id === currentId)
      .sort((a, b) => a.plateNumber.localeCompare(b.plateNumber))
      .map((v) => ({ id: v.id, label: `${v.plateNumber} · ${v.fleetNumber} · ${v.make} ${v.model}` }));
  });

  protected readonly driverOptions = computed(() => {
    const currentId = this.record()?.driverId;
    return this.directory
      .drivers()
      .filter((d) => d.status !== 'inactive' || d.id === currentId)
      .map((d) => ({ id: d.id, label: `${d.firstName} ${d.lastName}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  /** Trips of the selected vehicle, most recent first. */
  protected readonly tripOptions = computed(() => {
    const vehicleId = this.value().vehicleId;
    if (!vehicleId) return [];
    const currentTripId = this.record()?.tripId;
    return this.directory
      .trips()
      .filter((trip) => trip.vehicleId === vehicleId || trip.id === currentTripId)
      .sort((a, b) => b.plannedDeparture.localeCompare(a.plannedDeparture))
      .map((trip) => ({
        id: trip.id,
        reference: trip.reference,
        route: this.directory.routeLabel(trip),
        departure: trip.plannedDeparture,
      }));
  });

  private readonly timestampIso = computed(() => fromDateTimeLocalValue(this.value().timestamp));

  private readonly previous = computed(() => {
    const vehicle = this.vehicle();
    const timestamp = this.timestampIso();
    if (!vehicle || !timestamp) return null;
    return previousFuelRecord(this.directory.fuel(), vehicle.id, timestamp, this.record()?.id ?? null);
  });

  /** Reading to compare against: the previous fill, or the vehicle odometer for a new record. */
  protected readonly lastReading = computed<LastReading | null>(() => {
    const previous = this.previous();
    if (previous) return { km: previous.odometerKm, date: previous.timestamp, source: 'record' };
    const vehicle = this.vehicle();
    if (vehicle && !this.record()) return { km: vehicle.odometerKm, date: null, source: 'vehicle' };
    return null;
  });

  protected readonly odometerLower = computed(() => {
    const odometer = this.value().odometerKm;
    const last = this.lastReading();
    return odometer !== null && last !== null && Number(odometer) < last.km;
  });

  protected readonly exceedsTank = computed(() => {
    const vehicle = this.vehicle();
    const litres = this.value().litres;
    return !!vehicle && litres !== null && Number(litres) > vehicle.tankCapacityL;
  });

  /** Live consistency checks against the vehicle's previous record (same rules as the list). */
  protected readonly analysis = computed(() => {
    const value = this.value();
    const vehicle = this.vehicle();
    const timestamp = this.timestampIso();
    if (!vehicle || !timestamp || value.odometerKm === null || !value.litres || Number(value.litres) <= 0) return null;
    const draft: FuelRecord = {
      id: this.record()?.id ?? 'draft',
      organizationId: '',
      reference: this.record()?.reference ?? '',
      timestamp,
      vehicleId: vehicle.id,
      driverId: emptyToNull(value.driverId),
      tripId: emptyToNull(value.tripId),
      odometerKm: Number(value.odometerKm),
      litres: Number(value.litres),
      pricePerLitre: { amount: Number(value.pricePerLitre ?? 0), currency: value.currency },
      totalAmount: { amount: this.total(), currency: value.currency },
      fullTank: value.fullTank,
      station: value.station,
      location: value.location,
      receiptFileName: emptyToNull(value.receiptFileName),
      notes: value.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return analyseFuelRecord(draft, this.previous(), vehicle);
  });

  constructor() {
    queueMicrotask(() => this.populate());
  }

  protected isEditing(): boolean {
    return !!this.record();
  }

  /** User picked another vehicle: default its driver and drop a trip that belongs elsewhere. */
  protected onVehicleChange(): void {
    const vehicle = this.vehicle();
    const controls = this.form.controls;
    controls.driverId.setValue(vehicle?.assignedDriverId ?? '');
    const trip = this.directory.trip(controls.tripId.value);
    if (trip && trip.vehicleId !== vehicle?.id) controls.tripId.setValue('');
  }

  protected onTripChange(): void {
    const trip = this.directory.trip(this.form.controls.tripId.value);
    if (trip?.driverId) this.form.controls.driverId.setValue(trip.driverId);
  }

  protected onReceiptSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    if (file) {
      this.form.controls.receiptFileName.setValue(file.name);
      this.form.controls.receiptFileName.markAsDirty();
    }
    // The file itself is never read or uploaded (demo).
    inputElement.value = '';
  }

  protected clearReceipt(): void {
    this.form.controls.receiptFileName.setValue('');
    this.form.controls.receiptFileName.markAsDirty();
  }

  protected async submit(): Promise<void> {
    const timestamp = this.timestampIso();
    if (this.form.invalid || !timestamp) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const existing = this.record();
    const warningCount = this.analysis()?.warnings.length ?? 0;
    try {
      const record = await this.facade.save(existing?.id ?? null, {
        reference: existing?.reference ?? '',
        timestamp,
        vehicleId: value.vehicleId,
        driverId: emptyToNull(value.driverId),
        tripId: emptyToNull(value.tripId),
        odometerKm: Number(value.odometerKm),
        litres: Number(value.litres),
        pricePerLitre: { amount: Number(value.pricePerLitre), currency: value.currency },
        totalAmount: { amount: fuelTotal(value.litres, value.pricePerLitre), currency: value.currency },
        fullTank: value.fullTank,
        station: value.station.trim(),
        location: value.location.trim(),
        receiptFileName: emptyToNull(value.receiptFileName.trim()),
        notes: value.notes.trim(),
      });
      this.saved.emit({ record, created: !existing, warningCount });
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  private populate(): void {
    const record = this.record();
    if (record) {
      this.form.reset({
        vehicleId: record.vehicleId,
        driverId: record.driverId ?? '',
        tripId: record.tripId ?? '',
        timestamp: toDateTimeLocalValue(record.timestamp),
        odometerKm: record.odometerKm,
        litres: record.litres,
        pricePerLitre: record.pricePerLitre.amount,
        currency: record.pricePerLitre.currency,
        fullTank: record.fullTank,
        station: record.station,
        location: record.location,
        receiptFileName: record.receiptFileName ?? '',
        notes: record.notes,
      });
      return;
    }
    const defaults = this.defaults();
    const trip = this.directory.trip(defaults?.tripId);
    const vehicleId = defaults?.vehicleId ?? trip?.vehicleId ?? '';
    const vehicle = this.directory.vehicle(vehicleId);
    this.form.reset({
      ...this.form.getRawValue(),
      vehicleId: vehicle ? vehicle.id : '',
      driverId: defaults?.driverId ?? trip?.driverId ?? vehicle?.assignedDriverId ?? '',
      tripId: trip && (!vehicle || trip.vehicleId === vehicle.id) ? trip.id : '',
      timestamp: toDateTimeLocalValue(this.clock.now()),
      currency: 'MZN',
      fullTank: true,
    });
  }
}
