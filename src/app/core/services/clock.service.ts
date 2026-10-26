import { Injectable } from '@angular/core';
import { IsoDate, IsoDateTime } from '../models';
import { addDays, toIsoDateTime } from '../formatting/date-utils';

/**
 * The demo fixtures are generated relative to this date (see tools/generate-mock-data.mjs),
 * so "today" is pinned to keep statuses such as "expiring" or "overdue" reproducible.
 * Replace with the real system date once data comes from the backend.
 */
export const DEMO_REFERENCE_DATE: IsoDate = '2026-10-24';

@Injectable({ providedIn: 'root' })
export class ClockService {
  /** Calendar date considered "today" by the application. */
  today(): IsoDate {
    return DEMO_REFERENCE_DATE;
  }

  /** Current timestamp on the demo reference date, using the real wall-clock time. */
  now(): IsoDateTime {
    const wall = new Date();
    return toIsoDateTime(DEMO_REFERENCE_DATE, wall.getHours(), wall.getMinutes());
  }

  daysFromToday(days: number): IsoDate {
    return addDays(DEMO_REFERENCE_DATE, days);
  }
}
