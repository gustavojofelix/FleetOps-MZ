import { ConvertedMoney, CurrencyCode, CurrencyMeta, ExchangeRate, Money } from '../models';

export const CURRENCIES: Readonly<Record<CurrencyCode, CurrencyMeta>> = {
  MZN: { code: 'MZN', nameKey: 'currencies.MZN', fractionDigits: 2, historical: false },
  USD: { code: 'USD', nameKey: 'currencies.USD', fractionDigits: 2, historical: false },
  ZAR: { code: 'ZAR', nameKey: 'currencies.ZAR', fractionDigits: 2, historical: false },
  // Replaced by ZiG in 2024; kept so historical records still format correctly.
  ZWL: { code: 'ZWL', nameKey: 'currencies.ZWL', fractionDigits: 2, historical: true },
};

/** Currencies offered for new transactions and preferences. */
export const ACTIVE_CURRENCIES: readonly CurrencyCode[] = (Object.keys(CURRENCIES) as CurrencyCode[]).filter(
  (code) => !CURRENCIES[code].historical,
);

/**
 * Deterministic demo rates expressed in MZN per unit. These are NOT market rates and the UI
 * must label every converted figure as simulated. A future backend supplies dated rates.
 */
export const SIMULATED_RATES_TO_MZN: Readonly<Record<CurrencyCode, number>> = {
  MZN: 1,
  USD: 63.9,
  ZAR: 3.55,
  ZWL: 0.0021,
};

export const SIMULATED_RATES_EFFECTIVE_DATE = '2026-10-01';

/** Rates in use: the demo values until the backend supplies dated rates (setExchangeRates). */
let activeRates: Record<CurrencyCode, number> = { ...SIMULATED_RATES_TO_MZN };
let activeEffectiveDate = SIMULATED_RATES_EFFECTIVE_DATE;

/**
 * Replaces the rates used by every conversion (called once after sign-in with the latest rows of
 * `exchange_rates`). Converted figures stay labelled as simulated until a market source exists.
 */
export function setExchangeRates(ratesToMzn: Partial<Record<CurrencyCode, number>>, effectiveDate: string): void {
  activeRates = { ...activeRates, ...ratesToMzn, MZN: 1 };
  activeEffectiveDate = effectiveDate;
}

/** The rates currently used for conversions (MZN per unit) and their effective date. */
export function exchangeRatesInUse(): { ratesToMzn: Readonly<Record<CurrencyCode, number>>; effectiveDate: string } {
  return { ratesToMzn: activeRates, effectiveDate: activeEffectiveDate };
}

export function exchangeRate(from: CurrencyCode, to: CurrencyCode): ExchangeRate {
  return {
    from,
    to,
    rate: from === to ? 1 : activeRates[from] / activeRates[to],
    source: 'simulated',
    effectiveDate: activeEffectiveDate,
  };
}

const roundTo = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Converts without mutating the original; the original amount and currency stay available. */
export function convertMoney(money: Money, to: CurrencyCode): ConvertedMoney {
  const { rate } = exchangeRate(money.currency, to);
  return {
    original: { ...money },
    converted: { amount: roundTo(money.amount * rate, CURRENCIES[to].fractionDigits), currency: to },
    rate,
    simulated: money.currency !== to,
  };
}

/** Sums amounts in mixed currencies into a target currency using the simulated rates. */
export function sumInCurrency(amounts: readonly Money[], to: CurrencyCode): number {
  return roundTo(
    amounts.reduce((total, money) => total + money.amount * exchangeRate(money.currency, to).rate, 0),
    CURRENCIES[to].fractionDigits,
  );
}
