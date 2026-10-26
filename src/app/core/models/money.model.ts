export type CurrencyCode = 'MZN' | 'USD' | 'ZAR' | 'ZWL';

export const CURRENCY_CODES: readonly CurrencyCode[] = ['MZN', 'USD', 'ZAR', 'ZWL'];

/** An amount always travels with the currency it was transacted in. */
export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export interface CurrencyMeta {
  code: CurrencyCode;
  /** Translation key for the currency's display name. */
  nameKey: string;
  fractionDigits: number;
  /** Historical currencies are kept for old records but not offered for new transactions. */
  historical: boolean;
}

export interface ExchangeRate {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
  /** Mock rates are deterministic and must always be labelled as simulated in the UI. */
  source: 'simulated';
  effectiveDate: string;
}

export interface ConvertedMoney {
  original: Money;
  converted: Money;
  rate: number;
  simulated: boolean;
}
