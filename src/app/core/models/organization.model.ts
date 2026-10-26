import { IsoDateTime } from './common.model';
import { CurrencyCode } from './money.model';

export type DateFormatPreference = 'dd/MM/yyyy' | 'yyyy-MM-dd' | 'MM/dd/yyyy';
export type DistanceUnit = 'km' | 'mi';
export type VolumeUnit = 'l' | 'gal';

export interface OrganizationNotificationSettings {
  maintenanceDueDays: number;
  documentExpiryDays: number;
  tripDelayAlerts: boolean;
  fuelAnomalyAlerts: boolean;
  expenseApprovalAlerts: boolean;
  emailDigest: boolean;
}

export interface Organization {
  id: string;
  displayName: string;
  legalName: string;
  /** Número Único de Identificação Tributária (fictional). */
  taxId: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  reportingCurrency: CurrencyCode;
  defaultLanguage: string;
  timeZone: string;
  dateFormat: DateFormatPreference;
  distanceUnit: DistanceUnit;
  volumeUnit: VolumeUnit;
  notificationSettings: OrganizationNotificationSettings;
  createdAt: IsoDateTime;
}
