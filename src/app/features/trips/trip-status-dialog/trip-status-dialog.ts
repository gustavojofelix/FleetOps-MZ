import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { allowedTransitions } from '../../../core/domain/trip-rules';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Trip, TripStatus } from '../../../core/models';
import { TripWorkflowService } from '../../../core/services/trip-workflow.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ToastService } from '../../../shared/ui/toast/toast.service';

/** Status change limited to the allowed transitions; "delayed" requires a reason. */
@Component({
  selector: 'app-trip-status-dialog',
  imports: [Modal, TranslatePipe, Icon, StatusBadge],
  templateUrl: './trip-status-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripStatusDialog {
  /** Dialog is open while a trip is set. */
  readonly trip = input<Trip | null>(null);
  readonly closed = output<void>();
  readonly changed = output<Trip>();

  private readonly workflow = inject(TripWorkflowService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  protected readonly options = computed<readonly TripStatus[]>(() => {
    const trip = this.trip();
    return trip ? allowedTransitions(trip.status) : [];
  });
  protected readonly selected = linkedSignal<TripStatus | null>(() => this.options()[0] ?? null);
  protected readonly note = linkedSignal({ source: this.trip, computation: () => '' });
  protected readonly delayReason = linkedSignal({ source: this.trip, computation: () => '' });
  protected readonly attempted = linkedSignal({ source: this.trip, computation: () => false });
  protected readonly saving = signal(false);

  protected readonly needsReason = computed(() => this.selected() === 'delayed');
  protected readonly reasonMissing = computed(() => this.needsReason() && !this.delayReason().trim());

  protected async confirm(): Promise<void> {
    const trip = this.trip();
    const status = this.selected();
    if (!trip || !status) return;
    this.attempted.set(true);
    if (this.reasonMissing()) return;
    this.saving.set(true);
    try {
      const reason = this.needsReason() ? this.delayReason().trim() : null;
      const updated = await this.workflow.changeStatus(trip.id, status, this.note().trim(), reason);
      this.toast.success(
        this.i18n.t('trips.toasts.statusChanged', { reference: trip.reference, status: this.i18n.t('trips.status.' + status) }),
      );
      this.changed.emit(updated);
      this.closed.emit();
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }
}
