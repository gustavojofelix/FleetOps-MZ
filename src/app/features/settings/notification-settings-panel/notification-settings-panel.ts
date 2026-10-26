import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Organization } from '../../../core/models';
import { CompanySettingsService } from '../../../core/state/company-settings.service';
import { FieldError } from '../../../shared/ui/field-error/field-error';
import { Icon } from '../../../shared/ui/icon/icon';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { revealErrors } from '../../../shared/utils/form-utils';
import { trackSettingsForm } from '../settings-form';
import { SettingsScope } from '../settings-scope/settings-scope';

type AlertToggle = 'tripDelayAlerts' | 'fuelAnomalyAlerts' | 'expenseApprovalAlerts';

@Component({
  selector: 'app-notification-settings-panel',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, FieldError, Icon, SettingsScope],
  templateUrl: './notification-settings-panel.html',
  styleUrl: './notification-settings-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationSettingsPanel {
  readonly organization = input.required<Organization>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly settings = inject(CompanySettingsService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly toggles: readonly AlertToggle[] = ['tripDelayAlerts', 'fuelAnomalyAlerts', 'expenseApprovalAlerts'];
  protected readonly saving = signal(false);

  private readonly wholeDays = Validators.pattern(/^\d+$/);
  protected readonly form = this.fb.group({
    maintenanceDueDays: [14, [Validators.required, Validators.min(1), Validators.max(90), this.wholeDays]],
    documentExpiryDays: [30, [Validators.required, Validators.min(1), Validators.max(180), this.wholeDays]],
    tripDelayAlerts: [true],
    fuelAnomalyAlerts: [true],
    expenseApprovalAlerts: [true],
    emailDigest: [false],
  });

  private readonly saved = computed(() => ({ ...this.organization().notificationSettings }));
  protected readonly tracker = trackSettingsForm(this.form, this.saved);

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      revealErrors(this.form, this.host.nativeElement);
      this.toast.error(this.i18n.t('validation.formInvalid'));
      return;
    }
    this.saving.set(true);
    const value = this.form.getRawValue();
    try {
      await this.settings.save({
        notificationSettings: {
          ...value,
          maintenanceDueDays: Number(value.maintenanceDueDays),
          documentExpiryDays: Number(value.documentExpiryDays),
        },
      });
      this.toast.success(this.i18n.t('settings.toasts.saved'));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }

  protected discard(): void {
    this.tracker.discard();
    this.toast.info(this.i18n.t('settings.toasts.discarded'));
  }
}
