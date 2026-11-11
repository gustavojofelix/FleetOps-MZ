import { Injectable } from '@angular/core';
import { IsoDate, IsoDateTime } from '../models';
import { addDays, dateOfTimestamp, fromDateTimeLocalValue, toDateTimeLocalValue } from '../formatting/date-utils';

/**
 * Single source of "now" for the application, in the company time zone (Mozambique, UTC+2,
 * the same offset used by date-utils). Inject it instead of calling `new Date()` so tests can
 * pin the date.
 */
@Injectable({ providedIn: 'root' })
export class ClockService {
  /** Calendar date considered "today". */
  today(): IsoDate {
    return dateOfTimestamp(new Date().toISOString());
  }

  /** Current timestamp (minute precision) with the company offset. */
  now(): IsoDateTime {
    return fromDateTimeLocalValue(toDateTimeLocalValue(new Date().toISOString())) as IsoDateTime;
  }

  daysFromToday(days: number): IsoDate {
    return addDays(this.today(), days);
  }
}
