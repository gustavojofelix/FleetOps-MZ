import { Injectable, inject } from '@angular/core';
import { setExchangeRates } from '../formatting/currency';
import { CURRENCY_CODES, CurrencyCode } from '../models';
import { SUPABASE, toError } from './supabase-client';

/** Loads the latest rate per currency from `exchange_rates` into the conversion functions. */
@Injectable({ providedIn: 'root' })
export class ExchangeRatesLoader {
  private readonly client = inject(SUPABASE);
  private loaded: Promise<void> | null = null;

  load(): Promise<void> {
    this.loaded ??= this.fetch().catch((error) => {
      this.loaded = null;
      throw error;
    });
    return this.loaded;
  }

  private async fetch(): Promise<void> {
    const { data, error } = await this.client
      .from('exchange_rates')
      .select('currency, effective_date, rate_to_mzn')
      .lte('effective_date', new Date().toISOString().slice(0, 10))
      .order('effective_date', { ascending: false });
    if (error) throw toError(error);

    const latest: Partial<Record<CurrencyCode, number>> = {};
    let effectiveDate = '';
    for (const row of data as { currency: CurrencyCode; effective_date: string; rate_to_mzn: number }[]) {
      if (!CURRENCY_CODES.includes(row.currency) || latest[row.currency] !== undefined) continue;
      latest[row.currency] = Number(row.rate_to_mzn);
      if (row.effective_date > effectiveDate) effectiveDate = row.effective_date;
    }
    if (effectiveDate) setExchangeRates(latest, effectiveDate);
  }
}
