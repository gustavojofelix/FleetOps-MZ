import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { UserRepository } from '../../../core/data-access/repositories';
import { ACTIVE_CURRENCIES } from '../../../core/formatting/currency';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import {
  APPROVAL_STATUSES,
  ApprovalStatus,
  CurrencyCode,
  EXPENSE_CATEGORIES,
  Expense,
  ExpenseCategory,
  PAYMENT_METHODS,
  PaymentMethod,
} from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { Icon } from '../../../shared/ui/icon/icon';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { emptyToNull, positiveNumber, revealErrors } from '../../../shared/utils/form-utils';
import { ExpensesFacade } from '../expenses.facade';

/** Pre-filled values for a new expense (e.g. when opened from a trip context). */
export interface ExpenseFormDefaults {
  vehicleId?: string | null;
  tripId?: string | null;
  driverId?: string | null;
  category?: ExpenseCategory | null;
}

export interface ExpenseSaveResult {
  expense: Expense;
  created: boolean;
}

/** Create / edit form for an expense, rendered inside a drawer by the expenses page. */
@Component({
  selector: 'app-expense-form',
  imports: [ReactiveFormsModule, TranslatePipe, ...FORMAT_PIPES, FieldError, Icon],
  templateUrl: './expense-form.html',
  styleUrl: './expense-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseForm {
  readonly expense = input<Expense | null>(null);
  readonly defaults = input<ExpenseFormDefaults | null>(null);
  readonly saved = output<ExpenseSaveResult>();
  readonly cancelled = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly facade = inject(ExpensesFacade);
  private readonly users = inject(UserRepository);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly clock = inject(ClockService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly directory = inject(EntityDirectory);

  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly currencies = ACTIVE_CURRENCIES;
  protected readonly paymentMethods = PAYMENT_METHODS;
  protected readonly approvalStatuses = APPROVAL_STATUSES;
  protected readonly today = this.clock.today();
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    date: [this.clock.today(), Validators.required],
    category: ['tolls' as ExpenseCategory, Validators.required],
    amount: this.fb.control<number | null>(null, [Validators.required, positiveNumber]),
    currency: ['MZN' as CurrencyCode, Validators.required],
    vehicleId: [''],
    tripId: [''],
    driverId: [''],
    vendor: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.required, Validators.maxLength(200)]],
    paymentMethod: ['cash' as PaymentMethod, Validators.required],
    approvalStatus: ['pending' as ApprovalStatus, Validators.required],
    receiptFileName: [''],
    notes: ['', Validators.maxLength(500)],
  });

  protected readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  protected readonly vehicleOptions = computed(() => {
    const currentId = this.expense()?.vehicleId;
    return this.directory
      .vehicles()
      .filter((v) => v.status !== 'inactive' || v.id === currentId)
      .sort((a, b) => a.plateNumber.localeCompare(b.plateNumber))
      .map((v) => ({ id: v.id, label: `${v.plateNumber} · ${v.fleetNumber}` }));
  });

  protected readonly driverOptions = computed(() => {
    const currentId = this.expense()?.driverId;
    return this.directory
      .drivers()
      .filter((d) => d.status !== 'inactive' || d.id === currentId)
      .map((d) => ({ id: d.id, label: `${d.firstName} ${d.lastName}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  /** Trips (of the chosen vehicle, when one is set), most recent first. */
  protected readonly tripOptions = computed(() => {
    const vehicleId = this.value().vehicleId;
    const currentTripId = this.value().tripId;
    return this.directory
      .trips()
      .filter((trip) => !vehicleId || trip.vehicleId === vehicleId || trip.id === currentTripId)
      .sort((a, b) => b.plannedDeparture.localeCompare(a.plannedDeparture))
      .map((trip) => ({
        id: trip.id,
        label: `${trip.reference} · ${this.directory.routeLabel(trip)} · ${this.directory.plate(trip.vehicleId)}`,
        departure: trip.plannedDeparture,
      }));
  });

  protected readonly submittedBy = computed(() => {
    const userId = this.expense()?.submittedByUserId ?? this.users.currentUserId();
    return this.directory.user(userId)?.fullName ?? null;
  });

  constructor() {
    queueMicrotask(() => this.populate());
  }

  protected isEditing(): boolean {
    return !!this.expense();
  }

  /** Choosing a trip sets its vehicle and driver. */
  protected onTripChange(): void {
    const trip = this.directory.trip(this.form.controls.tripId.value);
    if (!trip) return;
    this.form.patchValue({ vehicleId: trip.vehicleId, driverId: trip.driverId ?? '' });
  }

  /** A trip of another vehicle no longer fits; default the driver when none is chosen. */
  protected onVehicleChange(): void {
    const vehicleId = this.form.controls.vehicleId.value;
    const trip = this.directory.trip(this.form.controls.tripId.value);
    if (trip && trip.vehicleId !== vehicleId) this.form.controls.tripId.setValue('');
    if (!this.form.controls.driverId.value) {
      this.form.controls.driverId.setValue(this.directory.vehicle(vehicleId)?.assignedDriverId ?? '');
    }
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
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const existing = this.expense();
    try {
      const expense = await this.facade.save(existing?.id ?? null, {
        reference: existing?.reference ?? '',
        date: value.date,
        category: value.category,
        // Stored exactly as entered, in its own currency.
        amount: { amount: Math.round(Number(value.amount) * 100) / 100, currency: value.currency },
        vehicleId: emptyToNull(value.vehicleId),
        tripId: emptyToNull(value.tripId),
        driverId: emptyToNull(value.driverId),
        vendor: value.vendor.trim(),
        description: value.description.trim(),
        paymentMethod: value.paymentMethod,
        approvalStatus: value.approvalStatus,
        submittedByUserId: existing?.submittedByUserId ?? this.users.currentUserId(),
        receiptFileName: emptyToNull(value.receiptFileName.trim()),
        notes: value.notes.trim(),
      });
      this.saved.emit({ expense, created: !existing });
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  private populate(): void {
    const expense = this.expense();
    if (expense) {
      this.form.reset({
        date: expense.date,
        category: expense.category,
        amount: expense.amount.amount,
        currency: expense.amount.currency,
        vehicleId: expense.vehicleId ?? '',
        tripId: expense.tripId ?? '',
        driverId: expense.driverId ?? '',
        vendor: expense.vendor,
        description: expense.description,
        paymentMethod: expense.paymentMethod,
        approvalStatus: expense.approvalStatus,
        receiptFileName: expense.receiptFileName ?? '',
        notes: expense.notes,
      });
      return;
    }
    const defaults = this.defaults();
    const trip = this.directory.trip(defaults?.tripId);
    const vehicleId = trip?.vehicleId ?? defaults?.vehicleId ?? '';
    this.form.reset({
      ...this.form.getRawValue(),
      date: this.clock.today(),
      category: defaults?.category ?? 'tolls',
      vehicleId,
      tripId: trip?.id ?? '',
      driverId: trip?.driverId ?? defaults?.driverId ?? this.directory.vehicle(vehicleId)?.assignedDriverId ?? '',
      approvalStatus: 'pending',
    });
  }
}
