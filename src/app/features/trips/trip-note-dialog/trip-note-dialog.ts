import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { TripRepository } from '../../../core/data-access/repositories';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Trip } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { ToastService } from '../../../shared/ui/toast/toast.service';

/** Adds a free-text 'note' event to the trip timeline. */
@Component({
  selector: 'app-trip-note-dialog',
  imports: [Modal, TranslatePipe, Icon],
  templateUrl: './trip-note-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripNoteDialog {
  readonly trip = input<Trip | null>(null);
  readonly closed = output<void>();

  private readonly trips = inject(TripRepository);
  private readonly clock = inject(ClockService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  protected readonly note = linkedSignal({ source: this.trip, computation: () => '' });
  /** Defaults to where the trip was last reported. */
  protected readonly location = linkedSignal({
    source: this.trip,
    computation: (trip) => (trip ? (trip.timeline.at(-1)?.location ?? trip.origin.city) : ''),
  });
  protected readonly attempted = linkedSignal({ source: this.trip, computation: () => false });
  protected readonly saving = signal(false);
  protected readonly noteMissing = computed(() => !this.note().trim());

  protected async confirm(): Promise<void> {
    const trip = this.trip();
    if (!trip) return;
    this.attempted.set(true);
    if (this.noteMissing()) return;
    this.saving.set(true);
    try {
      await this.trips.addEvent(trip.id, {
        timestamp: this.clock.now(),
        type: 'note',
        status: null,
        location: this.location().trim(),
        note: this.note().trim(),
      });
      this.toast.success(this.i18n.t('trips.toasts.noteAdded', { reference: trip.reference }));
      this.closed.emit();
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }
}
