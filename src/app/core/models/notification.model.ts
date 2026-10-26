import { IsoDateTime } from './common.model';

export type NotificationCategory =
  | 'maintenance'
  | 'document'
  | 'trip_delay'
  | 'fuel_anomaly'
  | 'expense_approval'
  | 'system';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'maintenance',
  'document',
  'trip_delay',
  'fuel_anomaly',
  'expense_approval',
  'system',
];

export interface AppNotification {
  id: string;
  organizationId: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  /** Translation keys so notifications follow the selected language. */
  titleKey: string;
  messageKey: string;
  params: Record<string, string | number>;
  createdAt: IsoDateTime;
  read: boolean;
  /** Router commands for the related record. */
  link: string[] | null;
}
