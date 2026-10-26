import { ChangeDetectionStrategy, Component, inject, input, linkedSignal, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CompanySettingsService } from '../../../core/state/company-settings.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icon-registry';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { CompanyProfilePanel } from '../company-profile-panel/company-profile-panel';
import { DemoDataPanel } from '../demo-data-panel/demo-data-panel';
import { MyPreferencesPanel } from '../my-preferences-panel/my-preferences-panel';
import { NotificationSettingsPanel } from '../notification-settings-panel/notification-settings-panel';
import { RegionalPanel } from '../regional-panel/regional-panel';
import { SETTINGS_TABS, SettingsTab, SettingsUnsavedChanges } from '../settings-form';

interface NavGroup {
  key: 'company' | 'personal' | 'demo';
  tabs: { tab: SettingsTab; icon: IconName }[];
}

const NAV: readonly NavGroup[] = [
  {
    key: 'company',
    tabs: [
      { tab: 'company', icon: 'building' },
      { tab: 'regional', icon: 'globe' },
      { tab: 'notifications', icon: 'bell' },
    ],
  },
  { key: 'personal', tabs: [{ tab: 'preferences', icon: 'user' }] },
  { key: 'demo', tabs: [{ tab: 'data', icon: 'archive' }] },
];

/**
 * Settings shell: company settings (shared, saved explicitly) and personal preferences
 * (saved locally on change). `?tab=company|regional|notifications|preferences|data`.
 */
@Component({
  selector: 'app-settings-page',
  imports: [
    TranslatePipe,
    PageHeader,
    EmptyState,
    Icon,
    CompanyProfilePanel,
    RegionalPanel,
    NotificationSettingsPanel,
    MyPreferencesPanel,
    DemoDataPanel,
  ],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SettingsUnsavedChanges],
})
export class SettingsPage {
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly i18n = inject(TranslationService);
  private readonly unsaved = inject(SettingsUnsavedChanges);
  protected readonly settings = inject(CompanySettingsService);

  /** Query param bound by the router. */
  readonly tab = input<string | undefined>();

  protected readonly nav = NAV;
  protected readonly activeTab = linkedSignal<SettingsTab>(() =>
    SETTINGS_TABS.includes(this.tab() as SettingsTab) ? (this.tab() as SettingsTab) : 'company',
  );
  private readonly reloadKey = signal(0);
  protected readonly query = createQuery(
    () => this.reloadKey(),
    () => this.settings.load(),
  );

  protected async select(tab: SettingsTab): Promise<void> {
    if (tab === this.activeTab()) return;
    if (!(await this.confirmDiscard())) return;
    this.activeTab.set(tab);
    void this.router.navigate([], { queryParams: { tab }, queryParamsHandling: 'merge', replaceUrl: true });
    queueMicrotask(() => document.getElementById('settings-panel')?.focus({ preventScroll: true }));
  }

  /** Used by the route's canDeactivate guard. */
  canLeave(): Promise<boolean> {
    return this.confirmDiscard();
  }

  private async confirmDiscard(): Promise<boolean> {
    if (!this.unsaved.dirty()) return true;
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('settings.unsaved.leaveTitle'),
      message: this.i18n.t('settings.unsaved.leaveMessage'),
      confirmLabel: this.i18n.t('settings.unsaved.leave'),
    });
    if (confirmed) this.unsaved.dirty.set(false);
    return confirmed;
  }
}
