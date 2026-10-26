import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { daysUntilExpiry } from '../../../core/domain/document-status';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { DRIVER_STATUSES, Driver, DriverStatus, LICENCE_CATEGORIES, LicenceCategory } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { CompanySettingsService } from '../../../core/state/company-settings.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { emptyToNull, phoneNumber, revealErrors } from '../../../shared/utils/form-utils';
import { DriversFacade } from '../drivers.facade';
import { driverName } from '../driver-utils';

/** Create / edit form, rendered inside a drawer by the list and detail pages. */
@Component({
  selector: 'app-driver-form',
  imports: [ReactiveFormsModule, TranslatePipe, FieldError],
  templateUrl: './driver-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriverForm {
  readonly driver = input<Driver | null>(null);
  readonly saved = output<Driver>();
  readonly cancelled = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly facade = inject(DriversFacade);
  private readonly directory = inject(EntityDirectory);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly clock = inject(ClockService);
  private readonly settings = inject(CompanySettingsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** "On a trip" is driven by trips, so it is never chosen by hand. */
  protected readonly statuses = DRIVER_STATUSES.filter((status) => status !== 'on_trip');
  protected readonly categories = LICENCE_CATEGORIES;
  protected readonly today = this.clock.today();
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(40)]],
    lastName: ['', [Validators.required, Validators.maxLength(40)]],
    employeeNumber: ['', [Validators.required, Validators.maxLength(12), (c: AbstractControl) => this.uniqueEmployeeNumber(c)]],
    phone: ['', [Validators.required, phoneNumber]],
    email: ['', [Validators.email, Validators.maxLength(80)]],
    city: ['Beira', [Validators.required, Validators.maxLength(40)]],
    nationalId: ['', [Validators.required, Validators.maxLength(20)]],
    licenceNumber: ['', [Validators.required, Validators.maxLength(20)]],
    licenceCategory: ['C+E' as LicenceCategory, Validators.required],
    licenceExpiry: ['', Validators.required],
    crossBorderAuthorized: [false],
    hireDate: [this.clock.today(), Validators.required],
    status: ['active' as DriverStatus, Validators.required],
    assignedVehicleId: [''],
    emergencyContactName: ['', Validators.maxLength(60)],
    emergencyContactPhone: ['', phoneNumber],
    notes: ['', Validators.maxLength(500)],
  });

  private readonly licenceExpiryValue = toSignal(this.form.controls.licenceExpiry.valueChanges, {
    initialValue: this.form.controls.licenceExpiry.value,
  });

  /** Warning shown under the licence expiry when it is expired or within the warning window. */
  protected readonly licenceWarning = computed<{ tone: 'warning' | 'danger'; text: string } | null>(() => {
    this.i18n.revision();
    const days = daysUntilExpiry(this.licenceExpiryValue() || null, this.clock.today());
    if (days === null) return null;
    if (days < 0) return { tone: 'danger', text: this.i18n.t('drivers.hints.licenceExpired') };
    if (days === 0) return { tone: 'warning', text: this.i18n.t('drivers.hints.licenceExpiringToday') };
    if (days <= this.settings.expiryWarningDays()) return { tone: 'warning', text: this.i18n.t('drivers.hints.licenceExpiring', { count: days }) };
    return null;
  });

  /** Vehicles in service; those driven by someone else show who would lose the assignment. */
  protected readonly vehicleOptions = computed(() => {
    const currentId = this.driver()?.id;
    const currentVehicle = this.driver()?.assignedVehicleId;
    return this.directory
      .vehicles()
      .filter((v) => v.status !== 'inactive' || v.id === currentVehicle)
      .map((v) => {
        const holder = v.assignedDriverId && v.assignedDriverId !== currentId ? this.directory.driver(v.assignedDriverId) : undefined;
        return {
          id: v.id,
          label: `${v.plateNumber} · ${v.make} ${v.model}`,
          assignedTo: holder ? driverName(holder) : null,
        };
      })
      .sort((a, b) => Number(!!a.assignedTo) - Number(!!b.assignedTo) || a.label.localeCompare(b.label));
  });

  constructor() {
    queueMicrotask(() => this.populate());
  }

  protected isEditing(): boolean {
    return !!this.driver();
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    const existing = this.driver();
    try {
      const saved = await this.facade.save(existing?.id ?? null, {
        employeeNumber: value.employeeNumber.trim().toUpperCase(),
        firstName: value.firstName.trim(),
        lastName: value.lastName.trim(),
        phone: value.phone.trim(),
        email: value.email.trim().toLowerCase(),
        city: value.city.trim(),
        nationalId: value.nationalId.trim().toUpperCase(),
        licenceNumber: value.licenceNumber.trim().toUpperCase(),
        licenceCategory: value.licenceCategory,
        licenceExpiry: value.licenceExpiry,
        crossBorderAuthorized: value.crossBorderAuthorized,
        hireDate: value.hireDate,
        status: existing ? existing.status : value.status,
        assignedVehicleId: emptyToNull(value.assignedVehicleId),
        emergencyContactName: value.emergencyContactName.trim(),
        emergencyContactPhone: value.emergencyContactPhone.trim(),
        incidents: existing?.incidents ?? [],
        notes: value.notes.trim(),
      });
      this.saved.emit(saved);
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  private populate(): void {
    const driver = this.driver();
    if (!driver) return;
    this.form.reset({
      firstName: driver.firstName,
      lastName: driver.lastName,
      employeeNumber: driver.employeeNumber,
      phone: driver.phone,
      email: driver.email,
      city: driver.city,
      nationalId: driver.nationalId,
      licenceNumber: driver.licenceNumber,
      licenceCategory: driver.licenceCategory,
      licenceExpiry: driver.licenceExpiry,
      crossBorderAuthorized: driver.crossBorderAuthorized,
      hireDate: driver.hireDate,
      status: driver.status,
      assignedVehicleId: driver.assignedVehicleId ?? '',
      emergencyContactName: driver.emergencyContactName,
      emergencyContactPhone: driver.emergencyContactPhone,
      notes: driver.notes,
    });
  }

  private uniqueEmployeeNumber(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value ?? '').trim().toUpperCase();
    if (!value) return null;
    const clash = this.directory.drivers().some((d) => d.id !== this.driver()?.id && d.employeeNumber.toUpperCase() === value);
    return clash ? { unique: 'drivers.validation.employeeNumberTaken' } : null;
  }
}
