import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Icon } from '../../../shared/ui/icon/icon';
import { TooltipDirective } from '../../../shared/ui/tooltip/tooltip.directive';

/** Badge stating whether a setting is shared by the company or personal to the user. */
@Component({
  selector: 'app-settings-scope',
  imports: [TranslatePipe, Icon, TooltipDirective],
  templateUrl: './settings-scope.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsScope {
  readonly scope = input.required<'company' | 'personal'>();
}
