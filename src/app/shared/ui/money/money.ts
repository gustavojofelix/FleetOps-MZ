import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input } from '@angular/core';
import { CurrencyService } from '../../../core/formatting/currency.service';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Money as MoneyValue } from '../../../core/models';
import { TooltipDirective } from '../tooltip/tooltip.directive';

/**
 * Shows a transaction amount in its ORIGINAL currency, optionally with the simulated
 * reporting-currency equivalent underneath. The stored amount is never modified.
 * `<app-money [value]="expense.amount" showConverted />`
 */
@Component({
  selector: 'app-money',
  imports: [TranslatePipe, TooltipDirective],
  templateUrl: './money.html',
  styleUrl: './money.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Money {
  readonly value = input.required<MoneyValue | null | undefined>();
  readonly showConverted = input(false, { transform: booleanAttribute });

  private readonly currency = inject(CurrencyService);
  private readonly format = inject(FormatService);

  protected readonly original = computed(() => this.format.money(this.value()));
  protected readonly conversion = computed(() => {
    const value = this.value();
    if (!value || !this.showConverted() || value.currency === this.currency.reporting()) return null;
    const converted = this.currency.toReporting(value);
    return {
      text: this.format.money(converted.converted),
      rate: this.format.number(converted.rate, 4),
      from: value.currency,
      to: converted.converted.currency,
    };
  });
}
