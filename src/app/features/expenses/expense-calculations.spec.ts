import { ApprovalStatus, ExpenseCategory, Expense, Money } from '../../core/models';
import { approvalCounts, categoryBreakdown, summariseExpenses } from './expense-calculations';

function expense(id: string, category: ExpenseCategory, amount: Money, approvalStatus: ApprovalStatus): Expense {
  return {
    id,
    organizationId: 'org',
    reference: `DSP-${id}`,
    date: '2026-10-01',
    category,
    amount,
    vehicleId: null,
    tripId: null,
    driverId: null,
    vendor: '',
    description: '',
    paymentMethod: 'cash',
    approvalStatus,
    submittedByUserId: 'u1',
    receiptFileName: null,
    notes: '',
    createdAt: '2026-10-01T08:00:00+02:00',
    updatedAt: '2026-10-01T08:00:00+02:00',
  };
}

const expenses = [
  expense('1', 'tolls', { amount: 2400, currency: 'MZN' }, 'approved'),
  expense('2', 'border_fees', { amount: 100, currency: 'USD' }, 'approved'),
  expense('3', 'tolls', { amount: 600, currency: 'MZN' }, 'pending'),
  expense('4', 'parking', { amount: 200, currency: 'ZAR' }, 'rejected'),
  expense('5', 'border_fees', { amount: 50.5, currency: 'USD' }, 'pending'),
];

describe('expense calculations', () => {
  it('totals by approval state in the reporting currency', () => {
    const summary = summariseExpenses(expenses, 'MZN');
    expect(summary.byApproval.approved).toEqual({ total: 8790, count: 2 });
    expect(summary.byApproval.pending.count).toBe(2);
    expect(summary.byApproval.pending.total).toBeCloseTo(600 + 50.5 * 63.9, 2);
    expect(summary.byApproval.rejected).toEqual({ total: 710, count: 1 });
    expect(summary.recordedCount).toBe(4);
    expect(summary.recordedTotal).toBeCloseTo(3000 + 150.5 * 63.9, 2);
    expect(summary.mixedCurrencies).toBe(true);
  });

  it('keeps per-currency totals in the original currency, excluding rejected expenses', () => {
    const { byCurrency } = summariseExpenses(expenses, 'MZN');
    expect(byCurrency).toEqual([
      { currency: 'MZN', amount: 3000, count: 2 },
      { currency: 'USD', amount: 150.5, count: 2 },
    ]);
  });

  it('breaks costs down by category, largest first', () => {
    const breakdown = categoryBreakdown(expenses, 'MZN');
    expect(breakdown.map((c) => c.category)).toEqual(['border_fees', 'tolls']);
    expect(breakdown[1]).toEqual({ category: 'tolls', total: 3000, count: 2 });
  });

  it('counts expenses per approval state', () => {
    expect(approvalCounts(expenses)).toEqual({ all: 5, pending: 2, approved: 2, rejected: 1 });
    expect(approvalCounts([])).toEqual({ all: 0, pending: 0, approved: 0, rejected: 0 });
  });

  it('reports a single-currency set as not mixed', () => {
    expect(summariseExpenses([expenses[0]], 'MZN').mixedCurrencies).toBe(false);
  });
});
