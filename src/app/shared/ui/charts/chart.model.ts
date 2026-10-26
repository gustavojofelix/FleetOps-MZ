/** A data series. `color` is a fixed categorical slot (1–6) tied to the entity, never its rank. */
export interface ChartSeries {
  key: string;
  label: string;
  values: readonly number[];
  color?: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color?: 1 | 2 | 3 | 4 | 5 | 6;
}

export type ValueFormatter = (value: number) => string;

/** Rounded axis ticks covering [min, max], always including 0. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const low = Math.min(0, Number.isFinite(min) ? min : 0);
  const high = Math.max(0, Number.isFinite(max) ? max : 0);
  if (high - low <= 0) return [0, 1];
  const rough = (high - low) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
  const start = Math.floor(low / step) * step;
  const end = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 1000; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6);
  }
  return ticks;
}

export function seriesColor(series: { color?: number }, index: number): string {
  return `var(--chart-${series.color ?? (index % 6) + 1})`;
}
