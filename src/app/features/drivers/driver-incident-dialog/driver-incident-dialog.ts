import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Driver, INCIDENT_TYPES, IncidentSeverity, IncidentType } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { Modal } from '../../../shared/ui/modal/modal';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { emptyToNull, revealErrors } from '../../../shared/utils/form-utils';
import { DriversFacade } from '../drivers.facade';
import { INCIDENT_SEVERITIES, driverName } from '../driver-utils';

/**
 * "Register incident" dialog. Mount it with `@if` so every opening starts with a clean form;
 * it appends the incident to `driver.incidents` through the facade.
 */
@Component({
  selector: 'app-driver-incident-dialog',
  imports: [Modal, ReactiveFormsModule, TranslatePipe, FieldError],
  templateUrl: './driver-incident-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriverIncidentDialog {
  readonly driver = input.required<Driver>();
  readonly closed = output<void>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly facade = inject(DriversFacade);
  private readonly directory = inject(EntityDirectory);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly clock = inject(ClockService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly types = INCIDENT_TYPES;
  protected readonly severities = INCIDENT_SEVERITIES;
  protected readonly today = this.clock.today();
  protected readonly saving = signal(false);
  protected readonly name = computed(() => driverName(this.driver()));

  protected readonly form = this.fb.group({
    date: [this.clock.today(), [Validators.required, (c: AbstractControl) => this.notInFuture(c)]],
    type: ['late_delivery' as IncidentType, Validators.required],
    severity: ['low' as IncidentSeverity, Validators.required],
    tripId: [''],
    description: ['', [Validators.required, Validators.maxLength(300)]],
  });

  /** The driver's trips, most recent first, to link the incident to. */
  protected readonly tripOptions = computed(() =>
    this.directory
      .trips()
      .filter((trip) => trip.driverId === this.driver().id)
      .sort((a, b) => b.plannedDeparture.localeCompare(a.plannedDeparture))
      .map((trip) => ({
        id: trip.id,
        label: `${trip.reference} · ${this.directory.routeLabel(trip)} · ${this.format.date(trip.plannedDeparture, 'short')}`,
      })),
  );

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    try {
      await this.facade.addIncident(this.driver().id, {
        date: value.date,
        type: value.type,
        severity: value.severity,
        tripId: emptyToNull(value.tripId),
        description: value.description.trim(),
      });
      this.toast.success(this.i18n.t('drivers.toasts.incidentAdded', { name: this.name() }));
      this.closed.emit();
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  private notInFuture(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value ?? '');
    return value && value > this.clock.today() ? { future: 'drivers.incidentForm.futureDate' } : null;
  }
}
