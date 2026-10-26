import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ChartSeries, ValueFormatter, niceTicks, seriesColor } from '../chart.model';
import { chartId, observeWidth } from '../chart-frame';

const PAD = { top: 16, right: 12, bottom: 28, left: 56 };
const MAX_BAR = 24;
const GAP = 2;
const RADIUS = 4;

interface BarRect {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  /** Path with a rounded data-end and a square baseline end. */
  d: string;
}

/** Vertical bars, grouped or stacked. One baseline; per-category hover tooltip. */
@Component({
  selector: 'app-bar-chart',
  templateUrl: './bar-chart.html',
  styleUrl: '../chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BarChart {
  readonly categories = input.required<readonly string[]>();
  readonly series = input.required<readonly ChartSeries[]>();
  readonly stacked = input(false);
  readonly height = input(240);
  readonly format = input<ValueFormatter>((value) => String(value));
  readonly axisFormat = input<ValueFormatter | null>(null);
  readonly ariaLabel = input('');
  /** Show the value above each bar (single-series charts with few bars). */
  readonly showValues = input(false);

  protected readonly id = chartId();
  protected readonly width = observeWidth();
  protected readonly active = signal<number | null>(null);
  protected readonly pad = PAD;

  protected readonly innerWidth = computed(() => Math.max(10, this.width() - PAD.left - PAD.right));
  protected readonly innerHeight = computed(() => Math.max(10, this.height() - PAD.top - PAD.bottom));
  protected readonly slot = computed(() => this.innerWidth() / Math.max(1, this.categories().length));

  protected readonly ticks = computed(() => {
    const series = this.series();
    const count = this.categories().length;
    let min = 0;
    let max = 0;
    for (let i = 0; i < count; i++) {
      if (this.stacked()) {
        const positive = series.reduce((sum, s) => sum + Math.max(0, s.values[i] ?? 0), 0);
        const negative = series.reduce((sum, s) => sum + Math.min(0, s.values[i] ?? 0), 0);
        max = Math.max(max, positive);
        min = Math.min(min, negative);
      } else {
        for (const s of series) {
          max = Math.max(max, s.values[i] ?? 0);
          min = Math.min(min, s.values[i] ?? 0);
        }
      }
    }
    return niceTicks(min, max);
  });

  protected y(value: number): number {
    const ticks = this.ticks();
    const min = ticks[0];
    const max = ticks[ticks.length - 1];
    return PAD.top + this.innerHeight() - ((value - min) / (max - min || 1)) * this.innerHeight();
  }

  protected center(index: number): number {
    return PAD.left + this.slot() * index + this.slot() / 2;
  }

  protected readonly bars = computed<BarRect[][]>(() => {
    const series = this.series();
    const slot = this.slot();
    const zero = this.y(0);
    return this.categories().map((_, index) => {
      const center = this.center(index);
      if (this.stacked()) {
        const width = Math.min(MAX_BAR, slot * 0.6);
        let positive = 0;
        let negative = 0;
        const segments: BarRect[] = [];
        const lastPositive = series.map((s) => (s.values[index] ?? 0) > 0).lastIndexOf(true);
        series.forEach((s, si) => {
          const value = s.values[index] ?? 0;
          if (!value) return;
          const start = value > 0 ? positive : negative;
          const end = start + value;
          if (value > 0) positive = end;
          else negative = end;
          const top = this.y(Math.max(start, end));
          const bottom = this.y(Math.min(start, end));
          // 2px surface gap between stacked segments.
          const height = Math.max(0, bottom - top - (segments.length ? GAP : 0));
          const isEnd = value > 0 ? si === lastPositive : false;
          segments.push(this.rect(s.key, center - width / 2, top, width, height, seriesColor(s, si), isEnd, value > 0));
        });
        return segments;
      }
      const count = Math.max(1, series.length);
      const barWidth = Math.max(4, Math.min(MAX_BAR, (slot * 0.72 - GAP * (count - 1)) / count));
      const groupWidth = barWidth * count + GAP * (count - 1);
      return series.map((s, si) => {
        const value = s.values[index] ?? 0;
        const x = center - groupWidth / 2 + si * (barWidth + GAP);
        const top = value >= 0 ? this.y(value) : zero;
        const height = Math.abs(this.y(value) - zero);
        return this.rect(s.key, x, top, barWidth, height, seriesColor(s, si), true, value >= 0);
      });
    });
  });

  protected readonly labelEvery = computed(() =>
    Math.max(1, Math.ceil(this.categories().length / Math.max(2, Math.floor(this.innerWidth() / 56)))),
  );

  protected readonly tooltip = computed(() => {
    const index = this.active();
    if (index === null) return null;
    const left = this.center(index);
    const series = this.series();
    const total = series.reduce((sum, s) => sum + (s.values[index] ?? 0), 0);
    return {
      category: this.categories()[index],
      left,
      flip: left > this.width() * 0.62,
      total: this.stacked() && series.length > 1 ? this.format()(total) : null,
      rows: series.map((s, i) => ({ label: s.label, color: seriesColor(s, i), value: this.format()(s.values[index] ?? 0) })),
    };
  });

  protected tickLabel(value: number): string {
    return (this.axisFormat() ?? this.format())(value);
  }

  protected valueLabel(index: number): string {
    return this.format()(this.series()[0]?.values[index] ?? 0);
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

  private rect(key: string, x: number, y: number, width: number, height: number, color: string, roundEnd: boolean, up: boolean): BarRect {
    const r = roundEnd ? Math.min(RADIUS, width / 2, height) : 0;
    const right = x + width;
    const bottom = y + height;
    const d = up
      ? `M${x},${bottom}V${y + r}Q${x},${y} ${x + r},${y}H${right - r}Q${right},${y} ${right},${y + r}V${bottom}Z`
      : `M${x},${y}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${right - r}Q${right},${bottom} ${right},${bottom - r}V${y}Z`;
    return { key, x, y, width, height, color, d };
  }
}
