import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icon-registry';

/**
 * Stat tile: label, value and an optional hint / delta. When `link` is set the whole
 * tile navigates to the filtered list behind the number.
 */
@Component({
  selector: 'app-kpi-card',
  imports: [Icon, RouterLink, NgTemplateOutlet],
  templateUrl: './kpi-card.html',
  styleUrl: './kpi-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly icon = input<IconName | null>(null);
  readonly hint = input<string | null>(null);
  /** Signed delta text, e.g. "+12 %"; tone decides its colour (and an arrow icon). */
  readonly delta = input<string | null>(null);
  readonly deltaTone = input<'positive' | 'negative' | 'neutral'>('neutral');
  readonly link = input<string | readonly unknown[] | null>(null);
  readonly queryParams = input<Record<string, string> | null>(null);
  readonly loading = input(false, { transform: booleanAttribute });
}
