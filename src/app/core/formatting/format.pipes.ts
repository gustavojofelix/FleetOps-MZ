import { Pipe, PipeTransform, inject } from '@angular/core';
import { CurrencyCode, Money } from '../models';
import { FormatService } from './format.service';
import { DateStyle, MoneyFormatOptions } from './formatters';

// All pipes are impure so they follow language, currency and settings changes immediately.

/** `{{ expense.amount | money }}` — formats in the transaction's own currency. */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly format = inject(FormatService);
  transform(value: Money | null | undefined, options?: MoneyFormatOptions): string {
    return this.format.money(value, options);
  }
}

/** `{{ 1250 | amount: 'USD' }}` — formats a bare number in the given currency. */
@Pipe({ name: 'amount', pure: false })
export class AmountPipe implements PipeTransform {
  private readonly format = inject(FormatService);
  transform(value: number | null | undefined, currency: CurrencyCode, options?: MoneyFormatOptions): string {
    return this.format.amount(value, currency, options);
  }
}

/** `{{ totalInReportingCurrency | reporting }}` — aggregate shown in the display currency. */
@Pipe({ name: 'reporting', pure: false })
export class ReportingMoneyPipe implements PipeTransform {
  private readonly format = inject(FormatService);
  transform(value: number | null | undefined, options?: MoneyFormatOptions): string {
    return this.format.reporting(value, options);
  }
}

@Pipe({ name: 'fmtDate', pure: false })
export class FormatDatePipe implements PipeTransform {
  private readonly format = inject(FormatService);
  transform(value: string | null | undefined, style: DateStyle = 'short'): string {
    return this.format.date(value, style);
  }
}

@Pipe({ name: 'relativeTime', pure: false })
export class RelativeTimePipe implements PipeTransform {
  private readonly format = inject(FormatService);
  transform(value: string | null | undefined): string {
    return this.format.relative(value);
  }
}

@Pipe({ name: 'num', pure: false })
export class NumberPipe implements PipeTransform {
  private readonly format = inject(FormatService);
  transform(value: number | null | undefined, maxDigits = 0, minDigits = 0): string {
    return this.format.number(value, maxDigits, minDigits);
  }
}

/** Ratio in, percentage out: `{{ 0.256 | pct }}` → 25,6 %. */
@Pipe({ name: 'pct', pure: false })
export class PercentPipe implements PipeTransform {
  private readonly format = inject(FormatService);
  transform(value: number | null | undefined, digits = 1): string {
    return this.format.percent(value, digits);
  }
}

@Pipe({ name: 'distance', pure: false })
export class DistancePipe implements PipeTransform {
  private readonly format = inject(FormatService);
  transform(km: number | null | undefined, digits = 0): string {
    return this.format.distance(km, digits);
  }
}

@Pipe({ name: 'volume', pure: false })
export class VolumePipe implements PipeTransform {
  private readonly format = inject(FormatService);
  transform(litres: number | null | undefined, digits = 1): string {
    return this.format.volume(litres, digits);
  }
}

/** Convenience bundle for component `imports`. */
export const FORMAT_PIPES = [
  MoneyPipe,
  AmountPipe,
  ReportingMoneyPipe,
  FormatDatePipe,
  RelativeTimePipe,
  NumberPipe,
  PercentPipe,
  DistancePipe,
  VolumePipe,
] as const;
