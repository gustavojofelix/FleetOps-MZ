import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { UserRepository } from '../../core/data-access/repositories';
import { CURRENCIES } from '../../core/formatting/currency';
import { CurrencyService } from '../../core/formatting/currency.service';
import { RelativeTimePipe } from '../../core/formatting/format.pipes';
import { LanguageCode } from '../../core/i18n/languages';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { CurrencyCode } from '../../core/models';
import { DemoDataService } from '../../core/services/demo-data.service';
import { EntityDirectory } from '../../core/services/entity-directory.service';
import { NotificationCenterService } from '../../core/services/notification-center.service';
import { ThemePreference } from '../../core/state/preferences.service';
import { ThemeService } from '../../core/state/theme.service';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm.service';
import { Dropdown, DropdownTrigger } from '../../shared/ui/dropdown/dropdown';
import { Icon } from '../../shared/ui/icon/icon';
import { IconName } from '../../shared/ui/icon/icon-registry';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { TooltipDirective } from '../../shared/ui/tooltip/tooltip.directive';
import { LayoutService } from '../layout.service';

const NOTIFICATION_ICONS: Record<string, IconName> = {
  maintenance: 'wrench',
  document: 'file-text',
  trip_delay: 'clock',
  fuel_anomaly: 'fuel',
  expense_approval: 'receipt',
  system: 'info',
};

@Component({
  selector: 'app-topbar',
  imports: [RouterLink, TranslatePipe, Icon, Dropdown, DropdownTrigger, TooltipDirective, RelativeTimePipe],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
  protected readonly layout = inject(LayoutService);
  protected readonly theme = inject(ThemeService);
  protected readonly i18n = inject(TranslationService);
  protected readonly currency = inject(CurrencyService);
  protected readonly notifications = inject(NotificationCenterService);
  private readonly router = inject(Router);
  private readonly directory = inject(EntityDirectory);
  private readonly users = inject(UserRepository);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly demo = inject(DemoDataService);

  protected readonly currencies = this.currency.activeCurrencies;
  protected readonly currencyMeta = CURRENCIES;
  protected readonly themes: { value: ThemePreference; icon: IconName }[] = [
    { value: 'light', icon: 'sun' },
    { value: 'dark', icon: 'moon' },
    { value: 'system', icon: 'monitor' },
  ];

  private readonly routeTitleKey = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.deepestTitleKey(this.router.routerState.snapshot.root)),
    ),
    { initialValue: this.deepestTitleKey(this.router.routerState.snapshot.root) },
  );
  protected readonly sectionTitle = computed(() => this.routeTitleKey() ?? 'navigation.dashboard');

  protected readonly user = computed(() => this.directory.user(this.users.currentUserId()));
  protected readonly initials = computed(() =>
    (this.user()?.fullName ?? '')
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join(''),
  );
  protected readonly recentNotifications = computed(() => this.notifications.notifications().slice(0, 5));

  protected notificationIcon(category: string): IconName {
    return NOTIFICATION_ICONS[category] ?? 'bell';
  }

  protected setLanguage(code: LanguageCode): void {
    void this.i18n.use(code);
  }

  protected setCurrency(code: CurrencyCode): void {
    this.currency.setDisplayCurrency(code);
  }

  protected async openNotification(id: string, link: string[] | null): Promise<void> {
    await this.notifications.markRead(id);
    if (link) void this.router.navigate(link);
  }

  protected signOut(): void {
    this.toast.info(this.i18n.t('shell.profile.signOut'), this.i18n.t('shell.profile.signOutDemo'));
  }

  protected async resetDemo(): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('shell.resetDemo.title'),
      message: this.i18n.t('shell.resetDemo.message'),
      confirmLabel: this.i18n.t('shell.resetDemo.confirm'),
    });
    if (!confirmed) return;
    await this.demo.resetAll();
    this.toast.success(this.i18n.t('shell.resetDemo.done'));
  }

  private deepestTitleKey(route: ActivatedRouteSnapshot): string | null {
    let current: ActivatedRouteSnapshot | null = route;
    let key: string | null = null;
    while (current) {
      key = (current.data['titleKey'] as string | undefined) ?? key;
      current = current.firstChild;
    }
    return key;
  }
}
