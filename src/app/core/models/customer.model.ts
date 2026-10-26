import { AuditStamps, TenantScoped } from './common.model';
import { CurrencyCode, Money } from './money.model';

export type CustomerStatus = 'active' | 'inactive';
export type CustomerSegment =
  | 'mining'
  | 'agriculture'
  | 'construction'
  | 'fuel'
  | 'retail'
  | 'freight_forwarding'
  | 'manufacturing';

export const CUSTOMER_STATUSES: readonly CustomerStatus[] = ['active', 'inactive'];
export const CUSTOMER_SEGMENTS: readonly CustomerSegment[] = [
  'mining',
  'agriculture',
  'construction',
  'fuel',
  'retail',
  'freight_forwarding',
  'manufacturing',
];

export interface Customer extends TenantScoped, AuditStamps {
  code: string;
  name: string;
  legalName: string;
  taxId: string;
  segment: CustomerSegment;
  status: CustomerStatus;
  contactName: string;
  contactRole: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  billingAddress: string;
  billingEmail: string;
  paymentTermsDays: number;
  preferredCurrency: CurrencyCode;
  creditLimit: Money;
  /** Demonstration figure only: there is no invoicing module yet. */
  outstandingBalance: Money;
  notes: string;
}
