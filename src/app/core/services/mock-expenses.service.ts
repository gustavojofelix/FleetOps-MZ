import { Injectable } from '@angular/core';
import { MockCollection, MockCollectionConfig } from '../data-access/mock-collection';
import { ExpenseQuery, ExpenseRepository } from '../data-access/repositories';
import { isWithinRange } from '../formatting/date-utils';
import { ApprovalStatus, Expense } from '../models';

@Injectable()
export class MockExpensesService extends MockCollection<Expense, ExpenseQuery> implements ExpenseRepository {
  protected readonly config: MockCollectionConfig<Expense> = {
    storageKey: 'expenses',
    idPrefix: 'e',
    fixtures: () => import('../mock-data/expenses.json').then((m) => m.default as unknown as Expense[]),
    searchFields: (e) => [e.reference, e.vendor, e.description],
    defaultSort: { field: 'date', direction: 'desc' },
  };

  protected matchesFilters(expense: Expense, query: ExpenseQuery): boolean {
    if (query.category && expense.category !== query.category) return false;
    if (query.approvalStatus && expense.approvalStatus !== query.approvalStatus) return false;
    if (query.currency && expense.amount.currency !== query.currency) return false;
    if (query.vehicleId && expense.vehicleId !== query.vehicleId) return false;
    if (query.tripId && expense.tripId !== query.tripId) return false;
    if ((query.from || query.to) && !isWithinRange(expense.date, query.from ?? null, query.to ?? null)) return false;
    return true;
  }

  setApproval(id: string, status: ApprovalStatus): Promise<Expense> {
    return this.update(id, { approvalStatus: status });
  }
}
