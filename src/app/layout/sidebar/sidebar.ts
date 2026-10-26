import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { NotificationCenterService } from '../../core/services/notification-center.service';
import { CompanySettingsService } from '../../core/state/company-settings.service';
import { Icon } from '../../shared/ui/icon/icon';
import { TooltipDirective } from '../../shared/ui/tooltip/tooltip.directive';
import { LayoutService } from '../layout.service';
import { NAVIGATION } from '../navigation';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, TranslatePipe, Icon, TooltipDirective],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  protected readonly layout = inject(LayoutService);
  protected readonly settings = inject(CompanySettingsService);
  protected readonly notifications = inject(NotificationCenterService);
  protected readonly sections = NAVIGATION;

  protected onNavigate(): void {
    this.layout.mobileNavOpen.set(false);
  }
}
