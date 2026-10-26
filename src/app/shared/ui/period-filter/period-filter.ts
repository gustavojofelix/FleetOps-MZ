import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';
import { ClockService } from '../../../core/services/clock.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { PERIOD_PRESETS, PeriodPreset, PeriodSelection, resolvePeriod } from '../../utils/period';

let nextId = 0;

/**
 * Date-range control: a preset select plus from/to inputs for custom ranges.
 * `<app-period-filter [(period)]="period" />`
 */
@Component({
  selector: 'app-period-filter',
  imports: [TranslatePipe],
  templateUrl: './period-filter.html',
  styleUrl: './period-filter.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodFilter {
  readonly period = model.required<PeriodSelection>();
  readonly presets = input<readonly PeriodPreset[]>(PERIOD_PRESETS);

  protected readonly uid = `period-${++nextId}`;
  private readonly clock = inject(ClockService);

  protected selectPreset(event: Event): void {
    const preset = (event.target as HTMLSelectElement).value as PeriodPreset;
    const current = this.period();
    this.period.set(resolvePeriod(preset, this.clock.today(), { from: current.from, to: current.to }));
  }

  protected setBound(bound: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value || null;
    const current = this.period();
    const next = { ...current, preset: 'custom' as const, [bound]: value };
    if (next.from && next.to && next.from > next.to) {
      if (bound === 'from') next.to = next.from;
      else next.from = next.to;
    }
    this.period.set(next);
  }
}
