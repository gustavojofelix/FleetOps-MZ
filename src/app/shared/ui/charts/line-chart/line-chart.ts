import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ChartSeries, ValueFormatter, niceTicks, seriesColor } from '../chart.model';
import { chartId, observeWidth } from '../chart-frame';

const PAD = { top: 14, right: 14, bottom: 28, left: 56 };

/** Line / area chart for change over time. Crosshair + tooltip on hover and arrow keys. */
@Component({
  selector: 'app-line-chart',
  templateUrl: './line-chart.html',
  styleUrl: '../chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LineChart {
  readonly categories = input.required<readonly string[]>();
  readonly series = input.required<readonly ChartSeries[]>();
  readonly height = input(240);
  readonly area = input(false);
  readonly format = input<ValueFormatter>((value) => String(value));
  readonly axisFormat = input<ValueFormatter | null>(null);
  readonly ariaLabel = input('');

  protected readonly id = chartId();
  protected readonly width = observeWidth();
  protected readonly active = signal<number | null>(null);

  protected readonly innerWidth = computed(() => Math.max(10, this.width() - PAD.left - PAD.right));
  protected readonly innerHeight = computed(() => Math.max(10, this.height() - PAD.top - PAD.bottom));
  protected readonly pad = PAD;

  protected readonly ticks = computed(() => {
    const values = this.series().flatMap((s) => s.values);
    return niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  });

  private readonly domain = computed(() => {
    const ticks = this.ticks();
    return { min: ticks[0], max: ticks[ticks.length - 1] };
  });

  protected x(index: number): number {
    const count = this.categories().length;
    if (count <= 1) return PAD.left + this.innerWidth() / 2;
    return PAD.left + (index / (count - 1)) * this.innerWidth();
  }

  protected y(value: number): number {
    const { min, max } = this.domain();
    return PAD.top + this.innerHeight() - ((value - min) / (max - min || 1)) * this.innerHeight();
  }

  protected readonly paths = computed(() =>
    this.series().map((series, index) => {
      const points = series.values.map((value, i) => `${this.x(i).toFixed(1)},${this.y(value).toFixed(1)}`);
      const line = points.length ? `M${points.join('L')}` : '';
      const baseline = this.y(Math.max(this.domain().min, 0)).toFixed(1);
      const area = points.length
        ? `${line}L${this.x(series.values.length - 1).toFixed(1)},${baseline}L${this.x(0).toFixed(1)},${baseline}Z`
        : '';
      return { key: series.key, label: series.label, color: seriesColor(series, index), line, area };
    }),
  );

  /** Thin out x labels so they never collide. */
  protected readonly labelEvery = computed(() => Math.max(1, Math.ceil(this.categories().length / Math.max(2, Math.floor(this.innerWidth() / 64)))));

  protected readonly tooltip = computed(() => {
    const index = this.active();
    if (index === null) return null;
    const left = this.x(index);
    return {
      category: this.categories()[index],
      left,
      flip: left > this.width() * 0.62,
      rows: this.series().map((series, i) => ({
        label: series.label,
        color: seriesColor(series, i),
        value: this.format()(series.values[index] ?? 0),
        y: this.y(series.values[index] ?? 0),
      })),
    };
  });

  protected tickLabel(value: number): string {
    return (this.axisFormat() ?? this.format())(value);
  }

  protected onPointerMove(event: PointerEvent): void {
    const svg = event.currentTarget as SVGElement;
    const rect = svg.getBoundingClientRect();
    const relative = ((event.clientX - rect.left) / rect.width) * this.width();
    const count = this.categories().length;
    if (!count) return;
    const index = count === 1 ? 0 : Math.round(((relative - PAD.left) / this.innerWidth()) * (count - 1));
    this.active.set(Math.min(count - 1, Math.max(0, index)));
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.categories().length;
    if (!count) return;
    const current = this.active() ?? -1;
    if (event.key === 'ArrowRight') this.active.set(Math.min(count - 1, current + 1));
    else if (event.key === 'ArrowLeft') this.active.set(Math.max(0, current <= 0 ? 0 : current - 1));
    else if (event.key === 'Escape') this.active.set(null);
    else return;
    event.preventDefault();
  }
}
