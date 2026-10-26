import { CurrencyCode, DateFormatPreference, DistanceUnit, VolumeUnit } from '../models';
import { CURRENCIES } from './currency';
import { isCalendarDate } from './date-utils';

// Pure Intl-based formatters. FormatService binds them to the active locale and settings.

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n|${locale}|${JSON.stringify(options)}`;
  let formatter = cache.get(key) as Intl.NumberFormat | undefined;
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    cache.set(key, formatter);
  }
  return formatter;
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d|${locale}|${JSON.stringify(options)}`;
  let formatter = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    cache.set(key, formatter);
  }
  return formatter;
}

export interface MoneyFormatOptions {
  /** Compact notation for KPIs (e.g. 1,2 M MTn). */
  compact?: boolean;
  /** Hide decimals for large aggregates. */
  wholeUnits?: boolean;
  signDisplay?: 'auto' | 'always' | 'exceptZero';
}

export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  locale: string,
  options: MoneyFormatOptions = {},
): string {
  const digits = CURRENCIES[currency]?.fractionDigits ?? 2;
  const formatOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    signDisplay: options.signDisplay ?? 'auto',
  };
  if (options.compact) {
    formatOptions.notation = 'compact';
    formatOptions.maximumFractionDigits = 1;
  } else if (options.wholeUnits) {
    formatOptions.maximumFractionDigits = 0;
    formatOptions.minimumFractionDigits = 0;
  } else {
    formatOptions.minimumFractionDigits = digits;
    formatOptions.maximumFractionDigits = digits;
  }
  return numberFormat(locale, formatOptions).format(amount);
}

export function formatNumber(value: number, locale: string, maximumFractionDigits = 0, minimumFractionDigits = 0): string {
  return numberFormat(locale, { maximumFractionDigits, minimumFractionDigits }).format(value);
}

export function formatCompactNumber(value: number, locale: string): string {
  return numberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** `value` is a ratio (0.25 → 25 %). */
export function formatPercent(value: number, locale: string, maximumFractionDigits = 1, signDisplay: 'auto' | 'exceptZero' = 'auto'): string {
  return numberFormat(locale, { style: 'percent', maximumFractionDigits, minimumFractionDigits: 0, signDisplay }).format(value);
}

const KM_PER_MILE = 1.609344;
const LITRES_PER_GALLON = 3.785411784;

export function formatDistance(km: number, locale: string, unit: DistanceUnit = 'km', maximumFractionDigits = 0): string {
  const value = unit === 'mi' ? km / KM_PER_MILE : km;
  return numberFormat(locale, { style: 'unit', unit: unit === 'mi' ? 'mile' : 'kilometer', maximumFractionDigits }).format(value);
}

export function formatVolume(litres: number, locale: string, unit: VolumeUnit = 'l', maximumFractionDigits = 1): string {
  const value = unit === 'gal' ? litres / LITRES_PER_GALLON : litres;
  return numberFormat(locale, { style: 'unit', unit: unit === 'gal' ? 'gallon' : 'liter', maximumFractionDigits }).format(value);
}

export type DateStyle = 'short' | 'medium' | 'long' | 'datetime' | 'time' | 'monthYear' | 'month' | 'weekdayShort' | 'dayMonth';

function assemblePattern(parts: Intl.DateTimeFormatPart[], pattern: DateFormatPreference): string {
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return pattern.replace('dd', get('day')).replace('MM', get('month')).replace('yyyy', get('year'));
}

/**
 * Formats calendar dates (YYYY-MM-DD, never shifted) and timestamps (shown in the company
 * time zone). Numeric styles follow the company's date-format preference.
 */
export function formatDate(
  value: string | null | undefined,
  locale: string,
  style: DateStyle = 'short',
  pattern: DateFormatPreference = 'dd/MM/yyyy',
  timeZone = 'Africa/Maputo',
): string {
  if (!value) return '—';
  const calendar = isCalendarDate(value);
  const date = calendar ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const zone = calendar ? 'UTC' : timeZone;

  switch (style) {
    case 'short':
    case 'datetime': {
      const parts = dateFormat('en-GB', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(date);
      const datePart = assemblePattern(parts, pattern);
      if (style === 'short' || calendar) return datePart;
      const time = dateFormat(locale, { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
      return `${datePart} ${time}`;
    }
    case 'time':
      return dateFormat(locale, { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
    case 'medium':
      return dateFormat(locale, { timeZone: zone, day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    case 'long':
      return dateFormat(locale, { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    case 'monthYear':
      return dateFormat(locale, { timeZone: zone, month: 'long', year: 'numeric' }).format(date);
    case 'month':
      return dateFormat(locale, { timeZone: zone, month: 'short' }).format(date).replace('.', '');
    case 'weekdayShort':
      return dateFormat(locale, { timeZone: zone, weekday: 'short' }).format(date);
    case 'dayMonth':
      return dateFormat(locale, { timeZone: zone, day: 'numeric', month: 'short' }).format(date);
  }
}

export function formatRelativeTime(value: string, nowMs: number, locale: string): string {
  const diffSeconds = (new Date(value).getTime() - nowMs) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(diffSeconds);
  if (abs < 60) return rtf.format(Math.round(diffSeconds), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 86_400 * 30) return rtf.format(Math.round(diffSeconds / 86_400), 'day');
  return rtf.format(Math.round(diffSeconds / (86_400 * 30)), 'month');
}
