import { IsoDate } from '../../core/models';
import { addDays } from '../../core/formatting/date-utils';

export type PeriodPreset = 'last30Days' | 'last90Days' | 'thisMonth' | 'lastMonth' | 'last6Months' | 'yearToDate' | 'allTime' | 'custom';

export const PERIOD_PRESETS: readonly PeriodPreset[] = [
  'last30Days',
  'last90Days',
  'thisMonth',
  'lastMonth',
  'last6Months',
  'yearToDate',
  'allTime',
  'custom',
];

export interface PeriodSelection {
  preset: PeriodPreset;
  from: IsoDate | null;
  to: IsoDate | null;
}

/** Resolves a preset to an inclusive date range relative to `today`. */
export function resolvePeriod(preset: PeriodPreset, today: IsoDate, custom?: { from: IsoDate | null; to: IsoDate | null }): PeriodSelection {
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  switch (preset) {
    case 'last30Days':
      return { preset, from: addDays(today, -29), to: today };
    case 'last90Days':
      return { preset, from: addDays(today, -89), to: today };
    case 'thisMonth':
      return { preset, from: `${month}-01`, to: today };
    case 'lastMonth': {
      const firstOfThisMonth = `${month}-01`;
      const lastOfPrevious = addDays(firstOfThisMonth, -1);
      return { preset, from: `${lastOfPrevious.slice(0, 7)}-01`, to: lastOfPrevious };
    }
    case 'last6Months': {
      const date = new Date(`${month}-01T00:00:00Z`);
      date.setUTCMonth(date.getUTCMonth() - 5);
      return { preset, from: date.toISOString().slice(0, 10), to: today };
    }
    case 'yearToDate':
      return { preset, from: `${year}-01-01`, to: today };
    case 'allTime':
      return { preset, from: null, to: null };
    case 'custom':
      return { preset, from: custom?.from ?? addDays(today, -29), to: custom?.to ?? today };
  }
}

/** The equally long period immediately before the given one (for deltas). */
export function previousPeriod(period: PeriodSelection): { from: IsoDate; to: IsoDate } | null {
  if (!period.from || !period.to) return null;
  const lengthDays = Math.round((Date.parse(period.to) - Date.parse(period.from)) / 86_400_000) + 1;
  return { from: addDays(period.from, -lengthDays), to: addDays(period.from, -1) };
}
