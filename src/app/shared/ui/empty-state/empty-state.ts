import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { Icon } from '../icon/icon';
import { IconName } from '../icon/icon-registry';

/** Centered empty / no-results / error message. Project actions as content. */
@Component({
  selector: 'app-empty-state',
  imports: [Icon],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-compact]': 'compact()', '[class.is-error]': 'tone() === "error"' },
})
export class EmptyState {
  readonly icon = input<IconName>('inbox');
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly compact = input(false, { transform: booleanAttribute });
  readonly tone = input<'neutral' | 'error'>('neutral');
}
