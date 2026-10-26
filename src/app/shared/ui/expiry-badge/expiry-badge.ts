import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input } from '@angular/core';
import { daysUntilExpiry, expiryStatus } from '../../../core/domain/document-status';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ClockService } from '../../../core/services/clock.service';
import { CompanySettingsService } from '../../../core/state/company-settings.service';
import { statusTone } from '../status-badge/status-tones';

/** Status badge for anything that expires (documents, licences, inspections). */
@Component({
  selector: 'app-expiry-badge',
  templateUrl: './expiry-badge.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpiryBadge {
  readonly date = input.required<string | null | undefined>();
  /** Show "Expires in 12 days" instead of the plain status. */
  readonly relative = input(false, { transform: booleanAttribute });

  private readonly clock = inject(ClockService);
  private readonly settings = inject(CompanySettingsService);
  private readonly i18n = inject(TranslationService);

  protected readonly status = computed(() => expiryStatus(this.date(), this.clock.today(), this.settings.expiryWarningDays()));
  protected readonly tone = computed(() => statusTone('document', this.status()));
  protected readonly label = computed(() => {
    this.i18n.revision();
    const days = daysUntilExpiry(this.date(), this.clock.today());
    const status = this.status();
    if (!this.relative() || days === null || status === 'valid') return this.i18n.t(`documents.status.${status}`);
    if (days === 0) return this.i18n.t('documents.expiresToday');
    return days > 0 ? this.i18n.t('documents.expiresIn', { count: days }) : this.i18n.t('documents.expiredAgo', { count: -days });
  });
}
