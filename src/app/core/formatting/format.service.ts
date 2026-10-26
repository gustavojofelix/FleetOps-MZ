import { Injectable, inject } from '@angular/core';
import { TranslationService } from '../i18n/translation.service';
import { CurrencyCode, Money } from '../models';
import { ClockService } from '../services/clock.service';
import { CompanySettingsService } from '../state/company-settings.service';
import { CurrencyService } from './currency.service';
import {
  DateStyle,
  MoneyFormatOptions,
  formatCompactNumber,
  formatDate,
  formatDistance,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatVolume,
} from './formatters';

/** Locale- and settings-aware formatting. Methods read signals, so callers stay reactive. */
@Injectable({ providedIn: 'root' })
export class FormatService {
  private readonly i18n = inject(TranslationService);
  private readonly settings = inject(CompanySettingsService);
  private readonly currency = inject(CurrencyService);
  private readonly clock = inject(ClockService);

  locale(): string {
    return this.i18n.locale();
  }

  money(value: Money | null | undefined, options?: MoneyFormatOptions): string {
    if (!value || value.amount === null || value.amount === undefined || Number.isNaN(value.amount)) return '—';
    return formatMoney(value.amount, value.currency, this.locale(), options);
  }

  amount(amount: number | null | undefined, currency: CurrencyCode, options?: MoneyFormatOptions): string {
    if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
    return formatMoney(amount, currency, this.locale(), options);
  }

  /** Formats an aggregate held in the reporting currency, in the user's display currency. */
  reporting(amount: number | null | undefined, options?: MoneyFormatOptions): string {
    if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
    const converted = this.currency.reportingToDisplay(amount);
    return formatMoney(converted.amount, converted.currency, this.locale(), options);
  }

  number(value: number | null | undefined, maxDigits = 0, minDigits = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return formatNumber(value, this.locale(), maxDigits, minDigits);
  }

  compact(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return formatCompactNumber(value, this.locale());
  }

  percent(ratio: number | null | undefined, digits = 1): string {
    if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—';
    return formatPercent(ratio, this.locale(), digits);
  }

  distance(km: number | null | undefined, digits = 0): string {
    if (km === null || km === undefined || Number.isNaN(km)) return '—';
    return formatDistance(km, this.locale(), this.settings.distanceUnit(), digits);
  }

  volume(litres: number | null | undefined, digits = 1): string {
    if (litres === null || litres === undefined || Number.isNaN(litres)) return '—';
    return formatVolume(litres, this.locale(), this.settings.volumeUnit(), digits);
  }

  date(value: string | null | undefined, style: DateStyle = 'short'): string {
    return formatDate(value, this.locale(), style, this.settings.dateFormat(), this.settings.timeZone());
  }

  relative(value: string | null | undefined): string {
    if (!value) return '—';
    return formatRelativeTime(value, new Date(this.clock.now()).getTime(), this.locale());
  }
}
