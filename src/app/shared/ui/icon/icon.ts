import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ICONS, IconName } from './icon-registry';

/** Decorative by default (aria-hidden). Pass `label` when the icon carries meaning on its own. */
@Component({
  selector: 'app-icon',
  imports: [LucideAngularModule],
  templateUrl: './icon.html',
  styleUrl: './icon.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
  },
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input<number | string>(18);
  readonly strokeWidth = input<number>(1.85);
  readonly label = input<string>('');

  protected readonly data = computed(() => ICONS[this.name()]);
}
