import { Injectable, computed, inject } from '@angular/core';
import { ConvertedMoney, CurrencyCode, Money } from '../models';
import { CompanySettingsService } from '../state/company-settings.service';
import { PreferencesService } from '../state/preferences.service';
import { ACTIVE_CURRENCIES, convertMoney, exchangeRate, sumInCurrency } from './currency';

/**
 * Currency context: aggregates are computed in the company reporting currency and may be
 * shown in a personal display currency. Converting for display never alters stored amounts.
 */
@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly settings = inject(CompanySettingsService);
  private readonly preferences = inject(PreferencesService);

  readonly activeCurrencies = ACTIVE_CURRENCIES;
  readonly reporting = this.settings.reportingCurrency;
  readonly display = computed<CurrencyCode>(() => this.preferences.displayCurrency() ?? this.reporting());
  /** True when aggregates are shown through a simulated conversion. */
  readonly displayIsConverted = computed(() => this.display() !== this.reporting());
  readonly displayRate = computed(() => exchangeRate(this.reporting(), this.display()));

  setDisplayCurrency(code: CurrencyCode): void {
    this.preferences.update({ displayCurrency: code === this.reporting() ? null : code });
  }

  toReporting(money: Money): ConvertedMoney {
    return convertMoney(money, this.reporting());
  }

  /** Converts an amount expressed in the reporting currency into the display currency. */
  reportingToDisplay(amount: number): Money {
    return convertMoney({ amount, currency: this.reporting() }, this.display()).converted;
  }

  sumToReporting(amounts: readonly Money[]): number {
    return sumInCurrency(amounts, this.reporting());
  }
}
