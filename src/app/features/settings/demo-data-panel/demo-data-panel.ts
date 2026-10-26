import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ClockService } from '../../../core/services/clock.service';
import { DemoDataService } from '../../../core/services/demo-data.service';
import { CompanySettingsService } from '../../../core/state/company-settings.service';
import { PreferencesService } from '../../../core/state/preferences.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icon-registry';
import { ToastService } from '../../../shared/ui/toast/toast.service';

@Component({
  selector: 'app-demo-data-panel',
  imports: [TranslatePipe, ...FORMAT_PIPES, Icon],
  templateUrl: './demo-data-panel.html',
  styleUrl: './demo-data-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DemoDataPanel {
  private readonly demo = inject(DemoDataService);
  private readonly preferences = inject(PreferencesService);
  private readonly settings = inject(CompanySettingsService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  protected readonly today = inject(ClockService).today();

  protected readonly items: { key: string; icon: IconName }[] = [
    { key: 'data', icon: 'boxes' },
    { key: 'storage', icon: 'archive' },
    { key: 'auth', icon: 'lock' },
    { key: 'rates', icon: 'coins' },
    { key: 'email', icon: 'mail' },
    { key: 'date', icon: 'calendar' },
  ];
  protected readonly resettingData = signal(false);
  protected readonly resettingPrefs = signal(false);

  protected async resetData(): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('shell.resetDemo.title'),
      message: this.i18n.t('shell.resetDemo.message'),
      confirmLabel: this.i18n.t('shell.resetDemo.confirm'),
    });
    if (!confirmed) return;
    this.resettingData.set(true);
    try {
      await this.demo.resetAll();
      const organization = this.settings.organization();
      if (organization) await this.i18n.applyCompanyDefault(organization.defaultLanguage);
      this.toast.success(this.i18n.t('shell.resetDemo.done'));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.resettingData.set(false);
    }
  }

  protected async resetPreferences(): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('settings.data.confirmPrefsTitle'),
      message: this.i18n.t('settings.data.confirmPrefsMessage'),
      confirmLabel: this.i18n.t('settings.data.resetPrefsButton'),
    });
    if (!confirmed) return;
    this.resettingPrefs.set(true);
    try {
      this.preferences.reset();
      // Language now follows the company default again; theme and currency follow their signals.
      await this.i18n.applyCompanyDefault(this.settings.organization()?.defaultLanguage ?? 'pt-MZ');
      this.toast.success(this.i18n.t('settings.data.prefsReset'));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.resettingPrefs.set(false);
    }
  }
}
