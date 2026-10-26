import { IsoDate, IsoDateTime } from '../models';

/** Fixed offset used by the demo data (Africa/Maputo has no daylight saving). */
export const COMPANY_UTC_OFFSET = '+02:00';

const pad = (value: number): string => String(value).padStart(2, '0');

export function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Parses a calendar date as UTC midnight so it never shifts across time zones. */
export function parseCalendarDate(value: IsoDate): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = parseCalendarDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseCalendarDate(to).getTime() - parseCalendarDate(from).getTime()) / 86_400_000);
}

export function toIsoDateTime(date: IsoDate, hours = 0, minutes = 0): IsoDateTime {
  return `${date}T${pad(hours)}:${pad(minutes)}:00${COMPANY_UTC_OFFSET}`;
}

/** Calendar date of a timestamp in the company time zone. */
export function dateOfTimestamp(value: IsoDateTime): IsoDate {
  const shifted = new Date(new Date(value).getTime() + 2 * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

/** Converts a timestamp to the value expected by <input type="datetime-local">. */
export function toDateTimeLocalValue(value: IsoDateTime | null | undefined): string {
  if (!value) return '';
  const shifted = new Date(new Date(value).getTime() + 2 * 3_600_000);
  return shifted.toISOString().slice(0, 16);
}

/** Converts an <input type="datetime-local"> value (company time) to an ISO timestamp. */
export function fromDateTimeLocalValue(value: string): IsoDateTime | null {
  if (!value) return null;
  return `${value.slice(0, 16)}:00${COMPANY_UTC_OFFSET}`;
}

export function hoursBetween(from: IsoDateTime, to: IsoDateTime): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
}

/** Month key (YYYY-MM) for grouping. */
export function monthKey(value: IsoDate | IsoDateTime): string {
  return (isCalendarDate(value) ? value : dateOfTimestamp(value)).slice(0, 7);
}

export function isWithinRange(value: IsoDate | IsoDateTime, from: IsoDate | null, to: IsoDate | null): boolean {
  const date = isCalendarDate(value) ? value : dateOfTimestamp(value);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/** Lists month keys from `from` to `to` inclusive. */
export function monthsInRange(from: IsoDate, to: IsoDate): string[] {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endKey = to.slice(0, 7);
  while (`${year}-${pad(month)}` <= endKey) {
    months.push(`${year}-${pad(month)}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
