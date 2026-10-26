import { Injectable, inject } from '@angular/core';
import { EntityInput } from '../../core/data-access/query.model';
import { ExpenseRepository } from '../../core/data-access/repositories';
import { ApprovalStatus, Expense } from '../../core/models';
import { nextReference } from '../fuel/fuel-calculations';

export type ExpenseInput = EntityInput<Expense>;

const REFERENCE_PREFIX = 'DSP';

/**
 * Expense workflows. Approval is a demo workflow: any user may approve or reject; real
 * permissions and an audit trail come with the backend.
 */
@Injectable({ providedIn: 'root' })
export class ExpensesFacade {
  private readonly expenses = inject(ExpenseRepository);

  async save(id: string | null, input: ExpenseInput): Promise<Expense> {
    if (id) return this.expenses.update(id, input);
    const all = await this.expenses.all();
    const reference =
      input.reference ||
      nextReference(
        all.map((expense) => expense.reference),
        REFERENCE_PREFIX,
      );
    return this.expenses.create({ ...input, reference });
  }

  setApproval(id: string, status: ApprovalStatus): Promise<Expense> {
    return this.expenses.setApproval(id, status);
  }

  /** Approves each expense in turn; returns how many succeeded. */
  async approveMany(ids: readonly string[]): Promise<number> {
    let approved = 0;
    for (const id of ids) {
      await this.expenses.setApproval(id, 'approved');
      approved += 1;
    }
    return approved;
  }

  delete(id: string): Promise<void> {
    return this.expenses.delete(id);
  }
}
