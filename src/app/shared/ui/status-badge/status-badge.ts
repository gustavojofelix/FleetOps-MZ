import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { StatusKind, Tone, statusLabelKey, statusTone } from './status-tones';

/**
 * `<app-status-badge kind="trip" [value]="trip.status" />`
 * The label always names the status, so meaning never depends on colour alone.
 */
@Component({
  selector: 'app-status-badge',
  imports: [TranslatePipe],
  templateUrl: './status-badge.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadge {
  readonly kind = input.required<StatusKind>();
  readonly value = input.required<string>();
  /** Overrides the tone derived from kind/value. */
  readonly tone = input<Tone | null>(null);

  protected readonly resolvedTone = computed(() => this.tone() ?? statusTone(this.kind(), this.value()));
  protected readonly labelKey = computed(() => statusLabelKey(this.kind(), this.value()));
}
