import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ACTIVE_TRIP_STATUSES, TRAILER_STATUSES, Trailer, TrailerStatus } from '../../../core/models';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TrailersFacade } from '../trailers.facade';

/** Manual availability change (available / maintenance / inactive). */
@Component({
  selector: 'app-trailer-status-dialog',
  imports: [Modal, TranslatePipe, Icon],
  templateUrl: './trailer-status-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrailerStatusDialog {
  /** Dialog is open while a trailer is set. */
  readonly trailer = input<Trailer | null>(null);
  readonly closed = output<void>();

  private readonly facade = inject(TrailersFacade);
  private readonly directory = inject(EntityDirectory);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  /** "In use" is driven by trips, so it is not offered as a manual status. */
  protected readonly options = TRAILER_STATUSES.filter((status) => status !== 'in_use');
  protected readonly selected = linkedSignal<TrailerStatus>(() => {
    const current = this.trailer()?.status ?? 'available';
    return current === 'available' ? 'maintenance' : 'available';
  });
  protected readonly saving = signal(false);

  protected readonly activeTrip = computed(() => {
    const trailer = this.trailer();
    if (!trailer) return null;
    return this.directory.trips().find((trip) => trip.trailerId === trailer.id && ACTIVE_TRIP_STATUSES.includes(trip.status)) ?? null;
  });

  protected async confirm(): Promise<void> {
    const trailer = this.trailer();
    if (!trailer || this.activeTrip()) return;
    this.saving.set(true);
    try {
      const status = this.selected();
      await this.facade.changeStatus(trailer.id, status);
      this.toast.success(
        this.i18n.t('trailers.toasts.statusChanged', { plate: trailer.plateNumber, status: this.i18n.t('trailers.status.' + status) }),
      );
      this.closed.emit();
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }
}
