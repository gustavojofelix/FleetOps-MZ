import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input } from '@angular/core';
import { CurrencyService } from '../../../core/formatting/currency.service';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Icon } from '../icon/icon';
import { TooltipDirective } from '../tooltip/tooltip.directive';

/**
 * Tag shown next to aggregates whenever figures pass through a simulated conversion.
 * By default it appears only when the display currency differs from the reporting currency;
 * set `always` when the aggregate itself mixes currencies.
 */
@Component({
  selector: 'app-simulated-notice',
  imports: [TranslatePipe, Icon, TooltipDirective],
  templateUrl: './simulated-notice.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimulatedNotice {
  readonly always = input(false, { transform: booleanAttribute });

  private readonly currency = inject(CurrencyService);
  private readonly format = inject(FormatService);

  protected readonly visible = computed(() => this.always() || this.currency.displayIsConverted());
  protected readonly rate = computed(() => {
    if (!this.currency.displayIsConverted()) return null;
    const rate = this.currency.displayRate();
    return { from: rate.from, to: rate.to, rate: this.format.number(rate.rate, 6) };
  });
}
