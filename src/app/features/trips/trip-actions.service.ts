import { Injectable, inject } from '@angular/core';
import { TranslationService } from '../../core/i18n/translation.service';
import { Trip } from '../../core/models';
import { TripWorkflowService } from '../../core/services/trip-workflow.service';
import { ConfirmService } from '../../shared/ui/confirm-dialog/confirm.service';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { isTripDeletable } from './trip-filters';

/** User-facing trip actions shared by the list and detail pages (confirmation + feedback). */
@Injectable({ providedIn: 'root' })
export class TripActions {
  private readonly workflow = inject(TripWorkflowService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  /** Deletes after confirmation. Resolves true when the trip was deleted. */
  async remove(trip: Trip): Promise<boolean> {
    if (!isTripDeletable(trip.status)) {
      this.toast.warning(this.i18n.t('trips.toasts.cannotDelete'));
      return false;
    }
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('trips.confirmDelete.title', { reference: trip.reference }),
      message: this.i18n.t('trips.confirmDelete.message'),
      confirmLabel: this.i18n.t('common.actions.delete'),
      tone: 'danger',
    });
    if (!confirmed) return false;
    try {
      await this.workflow.delete(trip.id);
      this.toast.success(this.i18n.t('trips.toasts.deleted', { reference: trip.reference }));
      return true;
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
      return false;
    }
  }
}
