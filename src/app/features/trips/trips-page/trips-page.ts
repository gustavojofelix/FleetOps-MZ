import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { TripQuery, TripRepository } from '../../../core/data-access/repositories';
import { allowedTransitions, delayHours } from '../../../core/domain/trip-rules';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ACTIVE_TRIP_STATUSES, Trip, TripStatus } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FleetAnalytics } from '../../../core/services/fleet-analytics.service';
import { CompanySettingsService } from '../../../core/state/company-settings.service';
import { Dropdown, DropdownTrigger } from '../../../shared/ui/dropdown/dropdown';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { Money } from '../../../shared/ui/money/money';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { PeriodFilter } from '../../../shared/ui/period-filter/period-filter';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TooltipDirective } from '../../../shared/ui/tooltip/tooltip.directive';
import { downloadCsv } from '../../../shared/utils/csv';
import { createListState } from '../../../shared/utils/list-state';
import { PeriodSelection, resolvePeriod } from '../../../shared/utils/period';
import { TripActions } from '../trip-actions.service';
import {
  QUICK_FILTER_STATUSES,
  TRIP_QUICK_FILTERS,
  TripQuickFilter,
  isTripEditable,
  parseStatusList,
  quickFilterOf,
  serializeStatusList,
} from '../trip-filters';
import { TripStatusDialog } from '../trip-status-dialog/trip-status-dialog';
import { TripStatusFilter } from '../trip-status-filter/trip-status-filter';

interface SelectOption {
  id: string;
  label: string;
}

@Component({
  selector: 'app-trips-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    StatusBadge,
    EmptyState,
    Icon,
    Money,
    Pagination,
    PeriodFilter,
    TableSkeleton,
    Dropdown,
    DropdownTrigger,
    TooltipDirective,
    TripStatusFilter,
    TripStatusDialog,
  ],
  templateUrl: './trips-page.html',
  styleUrl: './trips-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripsPage {
  private readonly repository = inject(TripRepository);
  private readonly analytics = inject(FleetAnalytics);
  private readonly actions = inject(TripActions);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly clock = inject(ClockService);
  private readonly settings = inject(CompanySettingsService);
  protected readonly directory = inject(EntityDirectory);

  /** Query params (bound by the router) so dashboard, search and detail pages can deep-link. */
  readonly status = input<string | undefined>();
  readonly customerId = input<string | undefined>();
  readonly vehicleId = input<string | undefined>();
  readonly driverId = input<string | undefined>();

  protected readonly quickFilters = TRIP_QUICK_FILTERS;
  protected readonly list = createListState({ pageSize: 10, sort: { field: 'plannedDeparture', direction: 'desc' } });
  protected readonly statusFilter = linkedSignal<TripStatus[]>(() => parseStatusList(this.status()));
  protected readonly customerFilter = linkedSignal<string | null>(() => this.customerId() || null);
  protected readonly vehicleFilter = linkedSignal<string | null>(() => this.vehicleId() || null);
  protected readonly driverFilter = linkedSignal<string | null>(() => this.driverId() || null);
  protected readonly period = signal<PeriodSelection>(resolvePeriod('allTime', this.clock.today()));
  protected readonly statusTarget = signal<Trip | null>(null);

  protected readonly quickFilter = computed(() => quickFilterOf(this.statusFilter()));

  private readonly filters = computed<TripQuery>(() => ({
    search: this.list.search(),
    statuses: this.statusFilter().length ? this.statusFilter() : null,
    customerId: this.customerFilter(),
    vehicleId: this.vehicleFilter(),
    driverId: this.driverFilter(),
    from: this.period().from,
    to: this.period().to,
    sort: this.list.sort(),
  }));

  protected readonly query = createQuery(
    () => ({ ...this.filters(), page: this.list.page(), pageSize: this.list.pageSize(), version: this.repository.changes() }),
    (params) => this.repository.list(params),
  );

  protected readonly quickCounts = computed(() => {
    const trips = this.directory.trips();
    const counts = new Map<TripQuickFilter, number>();
    for (const filter of TRIP_QUICK_FILTERS) {
      const statuses = QUICK_FILTER_STATUSES[filter];
      counts.set(filter, statuses.length ? trips.filter((trip) => statuses.includes(trip.status)).length : trips.length);
    }
    return counts;
  });

  protected readonly customerOptions = computed<SelectOption[]>(() =>
    this.directory
      .customers()
      .map((c) => ({ id: c.id, label: c.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );
  protected readonly vehicleOptions = computed<SelectOption[]>(() =>
    this.directory
      .vehicles()
      .map((v) => ({ id: v.id, label: `${v.plateNumber} · ${v.fleetNumber}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );
  protected readonly driverOptions = computed<SelectOption[]>(() =>
    this.directory
      .drivers()
      .map((d) => ({ id: d.id, label: `${d.firstName} ${d.lastName}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  protected readonly hasFilters = computed(
    () =>
      this.statusFilter().length > 0 ||
      !!this.customerFilter() ||
      !!this.vehicleFilter() ||
      !!this.driverFilter() ||
      this.period().preset !== 'allTime' ||
      this.list.hasSearch(),
  );

  /** Hours behind schedule for running or late-delivered trips (0 when on time). */
  protected readonly delays = computed(() => {
    const now = this.clock.now();
    return new Map(this.directory.trips().map((trip) => [trip.id, delayHours(trip, now)]));
  });

  protected readonly subtitle = computed(() => {
    const trips = this.directory.trips();
    return this.i18n.t('trips.subtitle', {
      total: this.format.number(trips.length),
      active: trips.filter((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status)).length,
      delayed: trips.filter((trip) => trip.status === 'delayed').length,
    });
  });

  protected profitability(trip: Trip) {
    return this.analytics.profitabilityOf(trip.id);
  }

  protected delayOf(trip: Trip): number {
    return this.delays().get(trip.id) ?? 0;
  }

  protected canEdit(trip: Trip): boolean {
    return isTripEditable(trip.status);
  }

  protected canChangeStatus(trip: Trip): boolean {
    return allowedTransitions(trip.status).length > 0;
  }

  protected setQuickFilter(filter: TripQuickFilter): void {
    this.setStatuses([...QUICK_FILTER_STATUSES[filter]]);
  }

  protected setStatuses(statuses: TripStatus[]): void {
    this.statusFilter.set(statuses);
    this.list.resetPage();
    this.syncUrl();
  }

  protected setEntityFilter(kind: 'customer' | 'vehicle' | 'driver', event: Event): void {
    const value = (event.target as HTMLSelectElement).value || null;
    const target = kind === 'customer' ? this.customerFilter : kind === 'vehicle' ? this.vehicleFilter : this.driverFilter;
    target.set(value);
    this.list.resetPage();
    this.syncUrl();
  }

  protected setPeriod(period: PeriodSelection): void {
    this.period.set(period);
    this.list.resetPage();
  }

  protected clearFilters(): void {
    this.statusFilter.set([]);
    this.customerFilter.set(null);
    this.vehicleFilter.set(null);
    this.driverFilter.set(null);
    this.period.set(resolvePeriod('allTime', this.clock.today()));
    this.list.clearSearch();
    this.syncUrl();
  }

  protected onQuickFilterKeydown(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = TRIP_QUICK_FILTERS[(index + delta + TRIP_QUICK_FILTERS.length) % TRIP_QUICK_FILTERS.length];
    this.setQuickFilter(next);
    queueMicrotask(() => document.getElementById(`trip-quick-${next}`)?.focus());
  }

  protected edit(trip: Trip): void {
    if (!isTripEditable(trip.status)) {
      this.toast.warning(this.i18n.t('trips.toasts.cannotEdit'));
      return;
    }
    void this.router.navigate(['/trips', trip.id, 'edit']);
  }

  protected remove(trip: Trip): Promise<boolean> {
    return this.actions.remove(trip);
  }

  protected async exportCsv(): Promise<void> {
    const result = await this.repository.list(this.filters());
    const t = (key: string) => this.i18n.t(key);
    const reporting = this.settings.reportingCurrency();
    downloadCsv(
      `${t('trips.csv.fileName')}-${this.clock.today()}`,
      [
        t('trips.fields.reference'),
        t('trips.fields.customerReference'),
        t('trips.fields.customer'),
        t('trips.fields.origin'),
        t('trips.fields.destination'),
        t('trips.fields.plannedDistance'),
        t('trips.fields.vehicle'),
        t('trips.fields.driver'),
        t('trips.fields.trailer'),
        t('trips.fields.cargoType'),
        t('trips.fields.plannedDeparture'),
        t('trips.fields.plannedArrival'),
        t('common.labels.status'),
        t('trips.fields.revenueAmount'),
        t('trips.fields.currency'),
        t('profitability.metrics.contributionMargin'),
        t('trips.csv.marginCurrency'),
        t('trips.csv.marginRatio'),
      ],
      result.items.map((trip) => {
        const profit = this.analytics.profitabilityOf(trip.id);
        return [
          trip.reference,
          trip.customerReference,
          this.directory.customerName(trip.customerId),
          `${trip.origin.city} (${trip.origin.country})`,
          `${trip.destination.city} (${trip.destination.country})`,
          trip.plannedDistanceKm,
          this.directory.plate(trip.vehicleId),
          this.directory.driverName(trip.driverId),
          this.directory.trailer(trip.trailerId)?.plateNumber ?? '',
          t(`trips.cargoTypes.${trip.cargo.type}`),
          this.format.date(trip.plannedDeparture, 'datetime'),
          this.format.date(trip.plannedArrival, 'datetime'),
          t(`trips.status.${trip.status}`),
          trip.revenue.amount,
          trip.revenue.currency,
          profit?.contributionMargin ?? '',
          reporting,
          profit?.marginRatio == null ? '' : Math.round(profit.marginRatio * 1000) / 10,
        ];
      }),
    );
    this.toast.success(t('common.toasts.exported'));
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      queryParams: {
        status: serializeStatusList(this.statusFilter()),
        customerId: this.customerFilter(),
        vehicleId: this.vehicleFilter(),
        driverId: this.driverFilter(),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
