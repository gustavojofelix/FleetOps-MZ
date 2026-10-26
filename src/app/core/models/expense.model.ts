import { AuditStamps, IsoDate, TenantScoped } from './common.model';
import { Money } from './money.model';

export type ExpenseCategory =
  | 'tolls'
  | 'border_fees'
  | 'driver_allowance'
  | 'parking'
  | 'loading'
  | 'repairs'
  | 'tyres'
  | 'insurance'
  | 'permits'
  | 'fines'
  | 'other';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'mobile_money' | 'fuel_card' | 'company_card';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'tolls',
  'border_fees',
  'driver_allowance',
  'parking',
  'loading',
  'repairs',
  'tyres',
  'insurance',
  'permits',
  'fines',
  'other',
];
export const APPROVAL_STATUSES: readonly ApprovalStatus[] = ['pending', 'approved', 'rejected'];
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'bank_transfer', 'mobile_money', 'fuel_card', 'company_card'];

export interface Expense extends TenantScoped, AuditStamps {
  reference: string;
  date: IsoDate;
  category: ExpenseCategory;
  amount: Money;
  vehicleId: string | null;
  tripId: string | null;
  driverId: string | null;
  vendor: string;
  description: string;
  paymentMethod: PaymentMethod;
  approvalStatus: ApprovalStatus;
  submittedByUserId: string;
  /** Placeholder for a future storage object key. */
  receiptFileName: string | null;
  notes: string;
}
