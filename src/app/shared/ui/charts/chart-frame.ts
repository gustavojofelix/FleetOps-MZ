import { DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';

/** Tracks the rendered width of the chart host so SVG text stays crisp at any size. */
export function observeWidth(fallback = 640) {
  const host = inject<ElementRef<HTMLElement>>(ElementRef);
  const width = signal(fallback);
  const destroyRef = inject(DestroyRef);
  afterNextRender(() => {
    const element = host.nativeElement;
    width.set(element.clientWidth || fallback);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0].contentRect.width);
      if (next > 0 && next !== width()) width.set(next);
    });
    observer.observe(element);
    destroyRef.onDestroy(() => observer.disconnect());
  });
  return width.asReadonly();
}

let nextChartId = 0;
export const chartId = (): string => `chart-${++nextChartId}`;
