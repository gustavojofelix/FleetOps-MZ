import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { COST_BUCKETS } from '../../../core/domain/profitability';
import { allowedTransitions, delayHours } from '../../../core/domain/trip-rules';
import { CurrencyService } from '../../../core/formatting/currency.service';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Trip, TripEvent } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FleetAnalytics } from '../../../core/services/fleet-analytics.service';
import { Dropdown, DropdownTrigger } from '../../../shared/ui/dropdown/dropdown';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ExpiryBadge } from '../../../shared/ui/expiry-badge/expiry-badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icon-registry';
import { Money } from '../../../shared/ui/money/money';
import { Breadcrumb, PageHeader } from '../../../shared/ui/page-header/page-header';
import { SimulatedNotice } from '../../../shared/ui/simulated-notice/simulated-notice';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TooltipDirective } from '../../../shared/ui/tooltip/tooltip.directive';
import { TripActions } from '../trip-actions.service';
import { isTripEditable } from '../trip-filters';
import { TripNoteDialog } from '../trip-note-dialog/trip-note-dialog';
import { TripStatusDialog } from '../trip-status-dialog/trip-status-dialog';

type MarkerTone = 'accent' | 'warning' | 'danger' | 'success' | null;

interface TimelineView {
  event: TripEvent;
  icon: IconName;
  tone: MarkerTone;
  highlight: boolean;
}

const EVENT_ICONS: Record<TripEvent['type'], IconName> = {
  created: 'plus',
  status_change: 'refresh',
  checkpoint: 'map-pin',
  border_crossing: 'flag',
  note: 'file-text',
  delay: 'triangle-alert',
};

@Component({
  selector: 'app-trip-detail-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    StatusBadge,
    ExpiryBadge,
    EmptyState,
    Icon,
    Money,
    SimulatedNotice,
    Dropdown,
    DropdownTrigger,
    TooltipDirective,
    TripStatusDialog,
    TripNoteDialog,
  ],
  templateUrl: './trip-detail-page.html',
  styleUrl: './trip-detail-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripDetailPage {
  /** Route param, bound by the router. */
  readonly id = input.required<string>();

  protected readonly directory = inject(EntityDirectory);
  private readonly analytics = inject(FleetAnalytics);
  private readonly currency = inject(CurrencyService);
  private readonly clock = inject(ClockService);
  private readonly actions = inject(TripActions);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  protected readonly buckets = COST_BUCKETS;
  protected readonly statusTarget = signal<Trip | null>(null);
  protected readonly noteTarget = signal<Trip | null>(null);

  protected readonly trip = computed(() => this.directory.trip(this.id()));
  protected readonly vehicle = computed(() => this.directory.vehicle(this.trip()?.vehicleId));
  protected readonly driver = computed(() => this.directory.driver(this.trip()?.driverId));
  protected readonly trailer = computed(() => this.directory.trailer(this.trip()?.trailerId));
  protected readonly customer = computed(() => this.directory.customer(this.trip()?.customerId));
  protected readonly route = computed(() => this.directory.routeById().get(this.trip()?.routeId ?? ''));
  protected readonly profit = computed(() => this.analytics.profitabilityOf(this.id()));

  protected readonly canEdit = computed(() => {
    const trip = this.trip();
    return !!trip && isTripEditable(trip.status);
  });
  protected readonly transitions = computed(() => {
    const trip = this.trip();
    return trip ? allowedTransitions(trip.status) : [];
  });
  protected readonly crossBorder = computed(() => {
    const trip = this.trip();
    return !!trip && (trip.origin.country !== trip.destination.country || !!this.route()?.crossBorder);
  });

  protected readonly delay = computed(() => {
    const trip = this.trip();
    return trip ? delayHours(trip, this.clock.now()) : 0;
  });

  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => [
    { label: 'trips.detail.backToList', link: '/trips', translate: true },
    { label: this.trip()?.reference ?? '…' },
  ]);

  protected readonly timeline = computed<TimelineView[]>(() =>
    [...(this.trip()?.timeline ?? [])]
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((event) => ({ event, icon: EVENT_ICONS[event.type], tone: this.toneOf(event), highlight: event.type === 'border_crossing' })),
  );

  protected readonly fuelRecords = computed(() =>
    this.directory
      .fuel()
      .filter((record) => record.tripId === this.id())
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  );

  protected readonly expenses = computed(() =>
    this.directory
      .expenses()
      .filter((expense) => expense.tripId === this.id())
      .sort((a, b) => a.date.localeCompare(b.date)),
  );

  protected readonly costTotals = computed(() => {
    const reporting = this.currency.reporting();
    const fuel = this.fuelRecords().map((record) => record.totalAmount);
    const counted = this.expenses().filter((expense) => expense.approvalStatus !== 'rejected');
    const expenses = counted.map((expense) => expense.amount);
    const fuelTotal = this.currency.sumToReporting(fuel);
    const expensesTotal = this.currency.sumToReporting(expenses);
    return {
      fuel: fuelTotal,
      expenses: expensesTotal,
      total: Math.round((fuelTotal + expensesTotal) * 100) / 100,
      mixed: [...fuel, ...expenses].some((money) => money.currency !== reporting),
      hasRejected: counted.length !== this.expenses().length,
    };
  });

  protected readonly documents = computed(() =>
    this.directory
      .documents()
      .filter((document) => document.entityType === 'trip' && document.entityId === this.id())
      .sort((a, b) => a.issueDate.localeCompare(b.issueDate)),
  );

  protected openEdit(trip: Trip): void {
    if (!isTripEditable(trip.status)) {
      this.toast.warning(this.i18n.t('trips.toasts.cannotEdit'));
      return;
    }
    void this.router.navigate(['/trips', trip.id, 'edit']);
  }

  protected async remove(trip: Trip): Promise<void> {
    if (await this.actions.remove(trip)) void this.router.navigate(['/trips']);
  }

  private toneOf(event: TripEvent): MarkerTone {
    if (event.type === 'delay' || event.status === 'delayed') return 'warning';
    if (event.type === 'border_crossing') return 'accent';
    if (event.status === 'cancelled') return 'danger';
    if (event.status === 'delivered' || event.status === 'completed') return 'success';
    if (event.type === 'created' || event.type === 'status_change') return 'accent';
    return null;
  }
}
