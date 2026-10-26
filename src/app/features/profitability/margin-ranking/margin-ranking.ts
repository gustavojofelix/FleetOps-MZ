import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { MarginTone, marginTone, marginToneLabel, rankByMargin } from '../profitability-data';

export interface RankingItem {
  key: string;
  label: string;
  /** Contribution margin ratio; null when there is no revenue. */
  marginRatio: number | null;
  revenue: number;
  /** Secondary line, e.g. "4 trips · 120 000 MT". */
  sub?: string;
  link?: readonly string[] | null;
}

interface RankingBar extends RankingItem {
  tone: MarginTone;
  toneLabel: string;
  value: string;
  left: number;
  width: number;
}

/**
 * Horizontal ranking of contribution margin % (HTML bars, one shared zero line so negative
 * margins extend to the left). Values are always printed next to the bar.
 */
@Component({
  selector: 'app-margin-ranking',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './margin-ranking.html',
  styleUrl: './margin-ranking.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarginRanking {
  readonly items = input.required<readonly RankingItem[]>();
  readonly limit = input(8);
  readonly ariaLabel = input('');

  private readonly format = inject(FormatService);
  protected readonly expanded = signal(false);

  private readonly ranked = computed(() => rankByMargin(this.items()));

  private readonly domain = computed(() => {
    const ratios = this.ranked()
      .map((item) => item.marginRatio)
      .filter((ratio): ratio is number => ratio !== null);
    const min = Math.min(0, ...ratios);
    const max = Math.max(0, ...ratios);
    return { min, max, span: max - min || 1 };
  });

  /** Position of the zero line, in % of the track. */
  protected readonly zero = computed(() => {
    const { min, span } = this.domain();
    return (-min / span) * 100;
  });

  protected readonly hasNegative = computed(() => this.domain().min < 0);

  protected readonly bars = computed<RankingBar[]>(() => {
    const { min, span } = this.domain();
    const all = this.ranked();
    const visible = this.expanded() ? all : all.slice(0, this.limit());
    return visible.map((item) => {
      const ratio = item.marginRatio;
      const tone = marginTone(ratio);
      return {
        ...item,
        tone,
        toneLabel: `profitability.tones.${marginToneLabel(tone)}`,
        value: this.format.percent(ratio),
        left: ratio === null ? 0 : ((Math.min(ratio, 0) - min) / span) * 100,
        width: ratio === null ? 0 : (Math.abs(ratio) / span) * 100,
      };
    });
  });

  protected readonly hiddenCount = computed(() => Math.max(0, this.ranked().length - this.limit()));
}
