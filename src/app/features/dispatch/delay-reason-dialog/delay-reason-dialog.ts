import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Trip } from '../../../core/models';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';

const MAX_LENGTH = 240;

/** Asks for the (mandatory) delay reason before a trip moves to "Delayed". */
@Component({
  selector: 'app-delay-reason-dialog',
  imports: [Modal, TranslatePipe, Icon],
  templateUrl: './delay-reason-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DelayReasonDialog {
  /** Dialog is open while a trip is set. */
  readonly trip = input<Trip | null>(null);
  readonly saving = input(false);
  readonly confirmed = output<string>();
  readonly closed = output<void>();

  protected readonly maxLength = MAX_LENGTH;
  /** Cleared whenever a different trip is opened. */
  protected readonly reason = linkedSignal({ source: this.trip, computation: () => '' });
  protected readonly touched = linkedSignal({ source: this.trip, computation: () => false });
  protected readonly invalid = computed(() => this.reason().trim().length < 3);
  protected readonly showError = computed(() => this.touched() && this.invalid());

  protected submit(): void {
    this.touched.set(true);
    if (this.invalid()) return;
    this.confirmed.emit(this.reason().trim());
  }
}
