import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ConfirmDialogHost } from '../../shared/ui/confirm-dialog/confirm-dialog-host';
import { ToastHost } from '../../shared/ui/toast/toast-host';
import { GlobalSearch } from '../global-search/global-search';
import { LayoutService } from '../layout.service';
import { Sidebar } from '../sidebar/sidebar';
import { Topbar } from '../topbar/topbar';

/** Authenticated-looking application frame. There is no real authentication in this phase. */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Sidebar, Topbar, GlobalSearch, ToastHost, ConfirmDialogHost, TranslatePipe],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.shell--collapsed]': 'layout.sidebarCollapsed()',
    '[class.shell--nav-open]': 'layout.mobileNavOpen()',
    '(document:keydown.escape)': 'layout.mobileNavOpen.set(false)',
  },
})
export class Shell {
  protected readonly layout = inject(LayoutService);
}
