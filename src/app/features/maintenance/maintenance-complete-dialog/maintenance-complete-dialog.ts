import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { maintenanceTotalCost } from '../../../core/domain/maintenance-rules';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { MaintenanceRecord } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { revealErrors } from '../../../shared/utils/form-utils';
import { MaintenanceFacade, MaintenanceResult } from '../maintenance.facade';

/** Closes a work order with its final costs, downtime and next service. */
@Component({
  selector: 'app-maintenance-complete-dialog',
  imports: [Modal, ReactiveFormsModule, TranslatePipe, ...FORMAT_PIPES, FieldError, Icon],
  templateUrl: './maintenance-complete-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaintenanceCompleteDialog {
  /** Dialog is open while a record is set. */
  readonly record = input<MaintenanceRecord | null>(null);
  readonly closed = output<void>();
  readonly completed = output<MaintenanceResult>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly facade = inject(MaintenanceFacade);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly clock = inject(ClockService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly directory = inject(EntityDirectory);

  protected readonly saving = signal(false);
  protected readonly today = this.clock.today();

  protected readonly form = this.fb.group({
    completedDate: ['', [Validators.required, (c: AbstractControl) => this.notBeforeStart(c)]],
    partsCost: [0, [Validators.required, Validators.min(0)]],
    labourCost: [0, [Validators.required, Validators.min(0)]],
    downtimeHours: [0, [Validators.required, Validators.min(0), Validators.max(2000)]],
    nextServiceKm: [null as number | null, (c: AbstractControl) => this.nextKm(c)],
    nextServiceDate: ['', (c: AbstractControl) => this.nextDate(c)],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly total = computed(() =>
    maintenanceTotalCost({ partsCost: Number(this.value().partsCost) || 0, labourCost: Number(this.value().labourCost) || 0 }),
  );

  constructor() {
    this.form.controls.completedDate.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.form.controls.nextServiceDate.updateValueAndValidity({ emitEvent: false }));
    effect(() => {
      const record = this.record();
      if (!record) return;
      untracked(() => this.populate(record));
    });
  }

  protected async confirm(): Promise<void> {
    const record = this.record();
    if (!record) return;
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    try {
      const result = await this.facade.complete(record, {
        completedDate: value.completedDate,
        partsCost: Number(value.partsCost) || 0,
        labourCost: Number(value.labourCost) || 0,
        downtimeHours: Number(value.downtimeHours) || 0,
        nextServiceKm: value.nextServiceKm === null || String(value.nextServiceKm) === '' ? null : Number(value.nextServiceKm),
        nextServiceDate: value.nextServiceDate || null,
      });
      this.completed.emit(result);
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  private populate(record: MaintenanceRecord): void {
    const started = record.startedDate ?? record.plannedDate;
    this.form.reset({
      completedDate: started > this.today ? started : this.today,
      partsCost: record.partsCost,
      labourCost: record.labourCost,
      downtimeHours: record.downtimeHours,
      nextServiceKm: record.nextServiceKm,
      nextServiceDate: record.nextServiceDate ?? '',
    });
  }

  private notBeforeStart(control: AbstractControl): ValidationErrors | null {
    const started = this.record()?.startedDate;
    const value = control.value as string;
    if (!started || !value || value >= started) return null;
    return { order: 'maintenance.validation.completedBeforeStarted' };
  }

  private nextKm(control: AbstractControl): ValidationErrors | null {
    const raw = control.value as number | string | null;
    if (raw === null || raw === '') return null;
    return Number(raw) > (this.record()?.odometerKm ?? 0) ? null : { nextKm: 'maintenance.validation.nextServiceKm' };
  }

  private nextDate(control: AbstractControl): ValidationErrors | null {
    const value = control.value as string;
    const completed = control.parent?.get('completedDate')?.value as string | undefined;
    if (!value || !completed || value > completed) return null;
    return { nextDate: 'maintenance.validation.nextServiceDate' };
  }
}
