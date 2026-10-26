import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { allowedTransitions, delayHours } from '../../../core/domain/trip-rules';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Trip, TripStatus } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { Dropdown, DropdownTrigger } from '../../../shared/ui/dropdown/dropdown';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icon-registry';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { corridorOf } from '../dispatch-board';

const TRANSITION_ICONS: Record<TripStatus, IconName> = {
  planned: 'calendar',
  preparing: 'package',
  in_transit: 'truck',
  delayed: 'hourglass',
  delivered: 'circle-check',
  completed: 'badge-check',
  cancelled: 'circle-x',
};

/**
 * A trip on the dispatch board. The whole card links to the trip; "Move to…" offers the
 * allowed status transitions (the accessible alternative to drag and drop).
 */
@Component({
  selector: 'app-dispatch-card',
  imports: [RouterLink, TranslatePipe, ...FORMAT_PIPES, Icon, StatusBadge, Dropdown, DropdownTrigger],
  templateUrl: './dispatch-card.html',
  styleUrl: './dispatch-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'dispatch-card',
    '[attr.draggable]': 'moving() ? "false" : "true"',
    '[class.is-moving]': 'moving()',
    '[class.is-dragging]': 'dragging()',
    '[attr.aria-busy]': 'moving() || null',
    '(dragstart)': 'onDragStart($event)',
    '(dragend)': 'dragEnded.emit($event)',
  },
})
export class DispatchCard {
  readonly trip = input.required<Trip>();
  readonly moving = input(false, { transform: booleanAttribute });
  readonly dragging = input(false, { transform: booleanAttribute });
  /** Open the "Move to…" menu upwards (last card of a column) so it is not clipped by the board. */
  readonly menuUp = input(false, { transform: booleanAttribute });
  readonly moveRequested = output<TripStatus>();
  readonly dragStarted = output<DragEvent>();
  readonly dragEnded = output<DragEvent>();

  protected readonly directory = inject(EntityDirectory);
  private readonly clock = inject(ClockService);
  private readonly format = inject(FormatService);
  private readonly i18n = inject(TranslationService);

  protected readonly transitions = computed(() => allowedTransitions(this.trip().status));
  protected readonly vehicle = computed(() => this.directory.vehicle(this.trip().vehicleId));
  protected readonly driver = computed(() => this.directory.driver(this.trip().driverId));
  protected readonly crossBorder = computed(() => corridorOf(this.trip()) === 'cross_border');

  protected readonly delay = computed(() => {
    const trip = this.trip();
    if (trip.status === 'planned' || trip.status === 'preparing' || trip.status === 'cancelled') return null;
    const hours = delayHours(trip, this.clock.now());
    return hours >= 1 ? Math.round(hours) : null;
  });

  /** One line of relative timing that matters for the current stage. */
  protected readonly timing = computed(() => {
    this.i18n.revision();
    const trip = this.trip();
    const now = new Date(this.clock.now()).getTime();
    switch (trip.status) {
      case 'planned':
      case 'preparing':
        return this.i18n.t('dispatch.card.departsRelative', { time: this.format.relative(trip.plannedDeparture) });
      case 'in_transit':
        return new Date(trip.plannedArrival).getTime() > now
          ? this.i18n.t('dispatch.card.etaRelative', { time: this.format.relative(trip.plannedArrival) })
          : this.i18n.t('dispatch.card.departedRelative', { time: this.format.relative(trip.actualDeparture ?? trip.plannedDeparture) });
      case 'delayed':
        return this.i18n.t('dispatch.card.departedRelative', { time: this.format.relative(trip.actualDeparture ?? trip.plannedDeparture) });
      default:
        return this.i18n.t('dispatch.card.deliveredRelative', { time: this.format.relative(trip.actualArrival ?? trip.plannedArrival) });
    }
  });

  protected transitionIcon(status: TripStatus): IconName {
    return TRANSITION_ICONS[status];
  }

  protected onDragStart(event: DragEvent): void {
    if (this.moving()) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData('text/plain', this.trip().id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.dragStarted.emit(event);
  }
}
