import { sumInCurrency } from '../../core/formatting/currency';
import { APPROVAL_STATUSES, ApprovalStatus, CURRENCY_CODES, CurrencyCode, Expense, ExpenseCategory } from '../../core/models';

/*
 * Pure calculations behind the expenses page. Aggregates are in the reporting currency
 * (simulated conversion); per-currency totals keep the original transaction currency.
 */

export interface ApprovalTotal {
  /** Reporting currency. */
  total: number;
  count: number;
}

export interface CurrencyTotal {
  currency: CurrencyCode;
  /** Original currency, never converted. */
  amount: number;
  count: number;
}

export interface ExpenseSummary {
  byApproval: Record<ApprovalStatus, ApprovalTotal>;
  /** Approved + pending (rejected expenses are not a cost), reporting currency. */
  recordedTotal: number;
  recordedCount: number;
  /** Approved + pending totals in each original currency, in CURRENCY_CODES order. */
  byCurrency: CurrencyTotal[];
  /** True when any expense is not in the reporting currency. */
  mixedCurrencies: boolean;
}

const isCost = (expense: Expense): boolean => expense.approvalStatus !== 'rejected';

export function summariseExpenses(expenses: readonly Expense[], reporting: CurrencyCode): ExpenseSummary {
  const byApproval = Object.fromEntries(
    APPROVAL_STATUSES.map((status) => {
      const list = expenses.filter((expense) => expense.approvalStatus === status);
      return [status, { total: sumInCurrency(list.map((e) => e.amount), reporting), count: list.length }];
    }),
  ) as Record<ApprovalStatus, ApprovalTotal>;

  const recorded = expenses.filter(isCost);
  const byCurrency = new Map<CurrencyCode, CurrencyTotal>();
  for (const expense of recorded) {
    const entry = byCurrency.get(expense.amount.currency) ?? { currency: expense.amount.currency, amount: 0, count: 0 };
    entry.amount = Math.round((entry.amount + expense.amount.amount) * 100) / 100;
    entry.count += 1;
    byCurrency.set(expense.amount.currency, entry);
  }

  return {
    byApproval,
    recordedTotal: sumInCurrency(
      recorded.map((e) => e.amount),
      reporting,
    ),
    recordedCount: recorded.length,
    byCurrency: CURRENCY_CODES.filter((code) => byCurrency.has(code)).map((code) => byCurrency.get(code)!),
    mixedCurrencies: expenses.some((expense) => expense.amount.currency !== reporting),
  };
}

export interface CategoryTotal {
  category: ExpenseCategory;
  /** Reporting currency. */
  total: number;
  count: number;
}

/** Approved + pending totals per category (reporting currency), largest first. */
export function categoryBreakdown(expenses: readonly Expense[], reporting: CurrencyCode): CategoryTotal[] {
  const groups = new Map<ExpenseCategory, Expense[]>();
  for (const expense of expenses.filter(isCost)) {
    const list = groups.get(expense.category) ?? [];
    list.push(expense);
    groups.set(expense.category, list);
  }
  return [...groups.entries()]
    .map(([category, list]) => ({
      category,
      total: sumInCurrency(
        list.map((e) => e.amount),
        reporting,
      ),
      count: list.length,
    }))
    .sort((a, b) => b.total - a.total);
}

export function approvalCounts(expenses: readonly Expense[]): Record<ApprovalStatus | 'all', number> {
  const counts: Record<ApprovalStatus | 'all', number> = { all: expenses.length, pending: 0, approved: 0, rejected: 0 };
  for (const expense of expenses) counts[expense.approvalStatus] += 1;
  return counts;
}
