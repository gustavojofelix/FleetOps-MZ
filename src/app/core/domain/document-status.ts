import { DocumentStatus, IsoDate } from '../models';
import { daysBetween } from '../formatting/date-utils';

export const DEFAULT_EXPIRY_WARNING_DAYS = 30;

/** Derives the status of anything with an optional expiry date (documents, licences, inspections). */
export function expiryStatus(
  expiryDate: IsoDate | null | undefined,
  today: IsoDate,
  warningDays = DEFAULT_EXPIRY_WARNING_DAYS,
): DocumentStatus {
  if (!expiryDate) return 'no_expiry';
  const remaining = daysBetween(today, expiryDate);
  if (remaining < 0) return 'expired';
  if (remaining <= warningDays) return 'expiring';
  return 'valid';
}

/** Days until expiry (negative when already expired), or null without an expiry date. */
export function daysUntilExpiry(expiryDate: IsoDate | null | undefined, today: IsoDate): number | null {
  return expiryDate ? daysBetween(today, expiryDate) : null;
}
