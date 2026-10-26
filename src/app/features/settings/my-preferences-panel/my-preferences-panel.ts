import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CURRENCIES, SIMULATED_RATES_EFFECTIVE_DATE, SIMULATED_RATES_TO_MZN } from '../../../core/formatting/currency';
import { CurrencyService } from '../../../core/formatting/currency.service';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { LanguageCode, findLanguage } from '../../../core/i18n/languages';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CurrencyCode, Organization } from '../../../core/models';
import { PreferencesService, ThemePreference } from '../../../core/state/preferences.service';
import { ThemeService } from '../../../core/state/theme.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icon-registry';
import { SettingsScope } from '../settings-scope/settings-scope';

/** Personal preferences: applied and stored locally as soon as they change (no save button). */
@Component({
  selector: 'app-my-preferences-panel',
  imports: [TranslatePipe, ...FORMAT_PIPES, Icon, SettingsScope],
  templateUrl: './my-preferences-panel.html',
  styleUrl: './my-preferences-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-resolved]': 'theme.resolved()' },
})
export class MyPreferencesPanel {
  readonly organization = input.required<Organization>();

  protected readonly theme = inject(ThemeService);
  protected readonly i18n = inject(TranslationService);
  protected readonly currency = inject(CurrencyService);
  protected readonly preferences = inject(PreferencesService);

  protected readonly themes: { value: ThemePreference; icon: IconName }[] = [
    { value: 'light', icon: 'sun' },
    { value: 'dark', icon: 'moon' },
    { value: 'system', icon: 'monitor' },
  ];
  protected readonly currencyMeta = CURRENCIES;
  protected readonly ratesEffectiveDate = SIMULATED_RATES_EFFECTIVE_DATE;
  protected readonly rates = this.currency.activeCurrencies
    .filter((code) => code !== 'MZN')
    .map((code) => ({ code, rate: SIMULATED_RATES_TO_MZN[code] }));

  /** Announced politely after each change, since there is no explicit save. */
  protected readonly status = signal('');

  protected readonly companyLanguageName = computed(
    () => findLanguage(this.organization().defaultLanguage)?.nativeName ?? this.organization().defaultLanguage,
  );

  protected setTheme(value: ThemePreference): void {
    this.theme.setPreference(value);
    this.announce();
  }

  protected async setLanguage(code: LanguageCode | null): Promise<void> {
    if (code) {
      await this.i18n.use(code);
    } else {
      this.preferences.update({ language: null });
      await this.i18n.applyCompanyDefault(this.organization().defaultLanguage);
    }
    this.announce();
  }

  protected setCurrency(code: CurrencyCode): void {
    this.currency.setDisplayCurrency(code);
    this.announce();
  }

  protected setSidebarCollapsed(event: Event): void {
    this.preferences.update({ sidebarCollapsed: (event.target as HTMLInputElement).checked });
    this.announce();
  }

  private announce(): void {
    this.status.set('');
    queueMicrotask(() => this.status.set(this.i18n.t('settings.toasts.preferenceSaved')));
  }
}
