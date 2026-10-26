import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DonutSlice, ValueFormatter, seriesColor } from '../chart.model';
import { chartId } from '../chart-frame';

interface Arc {
  key: string;
  label: string;
  value: number;
  share: number;
  color: string;
  d: string;
}

/** Part-to-whole for a handful of categories, with a legend carrying values and shares. */
@Component({
  selector: 'app-donut-chart',
  templateUrl: './donut-chart.html',
  styleUrls: ['../chart.scss', './donut-chart.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DonutChart {
  readonly slices = input.required<readonly DonutSlice[]>();
  readonly format = input<ValueFormatter>((value) => String(value));
  readonly percentFormat = input<ValueFormatter>((ratio) => `${Math.round(ratio * 100)}%`);
  readonly centerLabel = input('');
  readonly centerValue = input('');
  readonly size = input(168);
  readonly ariaLabel = input('');

  protected readonly id = chartId();
  protected readonly active = signal<string | null>(null);

  protected readonly total = computed(() => this.slices().reduce((sum, slice) => sum + Math.max(0, slice.value), 0));

  protected readonly arcs = computed<Arc[]>(() => {
    const total = this.total();
    const size = this.size();
    const outer = size / 2;
    const inner = outer * 0.66;
    const center = size / 2;
    let angle = -Math.PI / 2;
    // 2px surface gap between slices, expressed as an angle at the outer radius.
    const gap = this.slices().filter((s) => s.value > 0).length > 1 ? 2 / outer : 0;
    return this.slices()
      .filter((slice) => slice.value > 0)
      .map((slice, index) => {
        const share = total ? slice.value / total : 0;
        const sweep = share * Math.PI * 2;
        const start = angle + gap / 2;
        const end = angle + sweep - gap / 2;
        angle += sweep;
        return {
          key: slice.key,
          label: slice.label,
          value: slice.value,
          share,
          color: seriesColor(slice, index),
          d: this.arcPath(center, outer, inner, start, Math.max(start + 0.001, end)),
        };
      });
  });

  protected readonly activeArc = computed(() => this.arcs().find((arc) => arc.key === this.active()) ?? null);

  private arcPath(c: number, outer: number, inner: number, start: number, end: number): string {
    if (end - start >= Math.PI * 2 - 0.01) {
      // Full ring: two half arcs.
      return `M${c},${c - outer}A${outer},${outer} 0 1 1 ${c - 0.01},${c - outer}Z M${c},${c - inner}A${inner},${inner} 0 1 0 ${c + 0.01},${c - inner}Z`;
    }
    const large = end - start > Math.PI ? 1 : 0;
    const p = (r: number, a: number) => `${(c + r * Math.cos(a)).toFixed(2)},${(c + r * Math.sin(a)).toFixed(2)}`;
    return `M${p(outer, start)}A${outer},${outer} 0 ${large} 1 ${p(outer, end)}L${p(inner, end)}A${inner},${inner} 0 ${large} 0 ${p(inner, start)}Z`;
  }
}
