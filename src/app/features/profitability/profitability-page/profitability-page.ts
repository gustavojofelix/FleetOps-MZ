import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { COST_BUCKETS, TripProfitability } from '../../../core/domain/profitability';
import { CurrencyService } from '../../../core/formatting/currency.service';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Trip } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FleetAnalytics } from '../../../core/services/fleet-analytics.service';
import { BarChart } from '../../../shared/ui/charts/bar-chart/bar-chart';
import { ChartSeries, DonutSlice, ValueFormatter } from '../../../shared/ui/charts/chart.model';
import { DonutChart } from '../../../shared/ui/charts/donut-chart/donut-chart';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icon-registry';
import { KpiCard } from '../../../shared/ui/kpi-card/kpi-card';
import { Money } from '../../../shared/ui/money/money';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { PeriodFilter } from '../../../shared/ui/period-filter/period-filter';
import { SimulatedNotice } from '../../../shared/ui/simulated-notice/simulated-notice';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TooltipDirective } from '../../../shared/ui/tooltip/tooltip.directive';
import { downloadCsv } from '../../../shared/utils/csv';
import { PeriodSelection, resolvePeriod } from '../../../shared/utils/period';
import { MarginRanking, RankingItem } from '../margin-ranking/margin-ranking';
import {
  BUCKET_COLORS,
  DIMENSIONS,
  Dimension,
  GROUP_BYS,
  GroupBy,
  MEASURE_COLORS,
  ProfitabilityGroup,
  STATUS_SCOPES,
  SortDirection,
  StatusScope,
  bestAndWorst,
  chartMonths,
  groupKeyOf,
  groupRows,
  marginTone,
  marginToneLabel,
  monthlyProfitability,
  routeKey,
  selectTripRows,
  sortBy,
  totalsOf,
} from '../profitability-data';

type CostView = 'month' | 'share';

interface SortState {
  field: string;
  direction: SortDirection;
}

interface TripTableRow {
  id: string;
  trip: Trip;
  result: TripProfitability;
  route: string;
  customer: string;
  plate: string;
}

interface GroupTableRow extends ProfitabilityGroup {
  label: string;
  sub: string | null;
  link: string[] | null;
}

interface Column {
  key: string;
  label: string;
  num?: boolean;
  muted?: boolean;
}

interface Focus {
  dimension: Dimension;
  key: string;
  label: string;
}

const TRIP_SORT: Record<string, (row: TripTableRow) => number | string | null> = {
  reference: (row) => row.trip.reference,
  date: (row) => row.trip.plannedDeparture,
  route: (row) => row.route,
  customer: (row) => row.customer,
  vehicle: (row) => row.plate,
  revenue: (row) => row.result.revenue,
  fuel: (row) => row.result.costs.fuel,
  tolls_fees: (row) => row.result.costs.tolls_fees,
  driver_allowance: (row) => row.result.costs.driver_allowance,
  other: (row) => row.result.costs.other,
  directCosts: (row) => row.result.totalDirectCosts,
  margin: (row) => row.result.contributionMargin,
  marginRatio: (row) => row.result.marginRatio,
  costPerKm: (row) => row.result.costPerKm,
  maintenance: (row) => row.result.maintenanceAllocation,
};

const GROUP_SORT: Record<string, (row: GroupTableRow) => number | string | null> = {
  label: (row) => row.label,
  trips: (row) => row.trips,
  revenue: (row) => row.revenue,
  directCosts: (row) => row.totalDirectCosts,
  margin: (row) => row.contributionMargin,
  marginRatio: (row) => row.marginRatio,
  costPerKm: (row) => row.costPerKm,
  revenuePerKm: (row) => row.revenuePerKm,
};

const TEXT_FIELDS = ['reference', 'route', 'customer', 'vehicle', 'label'];

const GROUP_ICONS: Record<GroupBy, IconName> = { trip: 'route', customer: 'building', vehicle: 'truck', route: 'signpost' };

@Component({
  selector: 'app-profitability-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    KpiCard,
    EmptyState,
    Icon,
    Money,
    SimulatedNotice,
    PeriodFilter,
    BarChart,
    DonutChart,
    MarginRanking,
    Pagination,
    StatusBadge,
    TableSkeleton,
    TooltipDirective,
  ],
  templateUrl: './profitability-page.html',
  styleUrl: './profitability-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfitabilityPage {
  /** Query params bound by the router: `?groupBy=trip|customer|vehicle|route&scope=provisional`. */
  readonly groupBy = input<string | undefined>();
  readonly scope = input<string | undefined>();

  protected readonly directory = inject(EntityDirectory);
  private readonly analytics = inject(FleetAnalytics);
  private readonly currency = inject(CurrencyService);
  private readonly format = inject(FormatService);
  private readonly i18n = inject(TranslationService);
  private readonly clock = inject(ClockService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly groupBys = GROUP_BYS;
  protected readonly dimensions = DIMENSIONS;
  protected readonly scopes = STATUS_SCOPES;
  protected readonly buckets = COST_BUCKETS;
  protected readonly groupIcons = GROUP_ICONS;

  protected readonly view = linkedSignal<GroupBy>(() => (GROUP_BYS.includes(this.groupBy() as GroupBy) ? (this.groupBy() as GroupBy) : 'trip'));
  protected readonly statusScope = linkedSignal<StatusScope>(() => (this.scope() === 'provisional' ? 'provisional' : 'finished'));
  protected readonly period = signal<PeriodSelection>(resolvePeriod('last90Days', this.clock.today()));
  protected readonly costView = signal<CostView>('month');
  protected readonly rankingDimension = linkedSignal<Dimension>(() => {
    const view = this.view();
    return view === 'trip' ? 'customer' : view;
  });
  protected readonly focus = signal<Focus | null>(null);
  protected readonly sort = linkedSignal<SortState>(() =>
    this.view() === 'trip' ? { field: 'date', direction: 'desc' } : { field: 'revenue', direction: 'desc' },
  );
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);

  protected readonly loading = this.directory.loading;
  protected readonly reportingCurrency = this.currency.reporting;

  // ---- Data ---------------------------------------------------------------------------

  protected readonly rows = computed(() => {
    const period = this.period();
    return selectTripRows(this.directory.trips(), this.analytics.tripProfitability(), {
      from: period.from,
      to: period.to,
      scope: this.statusScope(),
    });
  });

  protected readonly totals = computed(() => totalsOf(this.rows()));
  protected readonly provisionalCount = computed(() => this.totals().provisionalTrips);

  private readonly monthly = computed(() => {
    const period = this.period();
    return monthlyProfitability(this.rows(), chartMonths(this.rows(), period.from, period.to));
  });

  protected readonly monthLabels = computed(() => {
    const months = this.monthly().months;
    const multiYear = new Set(months.map((month) => month.slice(0, 4))).size > 1;
    return months.map((month) => {
      const label = this.format.date(`${month}-01`, 'month');
      return multiYear ? `${label} ${month.slice(2, 4)}` : label;
    });
  });

  protected readonly revenueCostSeries = computed<ChartSeries[]>(() => [
    { key: 'revenue', label: this.i18n.t('profitability.metrics.revenue'), values: this.monthly().revenue, color: MEASURE_COLORS.revenue },
    { key: 'directCosts', label: this.i18n.t('profitability.metrics.directCosts'), values: this.monthly().directCosts, color: MEASURE_COLORS.directCosts },
  ]);

  protected readonly bucketSeries = computed<ChartSeries[]>(() =>
    COST_BUCKETS.map((bucket) => ({
      key: bucket,
      label: this.i18n.t(`profitability.buckets.${bucket}`),
      values: this.monthly().buckets[bucket],
      color: BUCKET_COLORS[bucket],
    })),
  );

  protected readonly bucketSlices = computed<DonutSlice[]>(() =>
    COST_BUCKETS.map((bucket) => ({
      key: bucket,
      label: this.i18n.t(`profitability.buckets.${bucket}`),
      value: this.totals().costs[bucket],
      color: BUCKET_COLORS[bucket],
    })),
  );

  protected readonly moneyFormat: ValueFormatter = (value) => this.format.reporting(value, { wholeUnits: true });
  protected readonly axisFormat: ValueFormatter = (value) => this.format.reporting(value, { compact: true });
  protected readonly percentFormat: ValueFormatter = (ratio) => this.format.percent(ratio, 0);

  private readonly groups = computed<Record<Dimension, ProfitabilityGroup[]>>(() => {
    const rows = this.rows();
    return { customer: groupRows(rows, 'customer'), vehicle: groupRows(rows, 'vehicle'), route: groupRows(rows, 'route') };
  });

  protected readonly rankingItems = computed<RankingItem[]>(() => {
    const dimension = this.rankingDimension();
    return this.groups()[dimension].map((group) => ({
      key: group.key,
      label: this.labelFor(dimension, group.key),
      marginRatio: group.marginRatio,
      revenue: group.revenue,
      sub: this.groupSub(group),
      link: this.linkFor(dimension, group.key),
    }));
  });

  protected readonly callouts = computed(() => {
    const { best, worst } = bestAndWorst(this.rankingItems());
    return { best, worst };
  });

  // ---- Tables -------------------------------------------------------------------------

  protected readonly tripColumns = computed<Column[]>(() => [
    { key: 'reference', label: 'common.labels.trip' },
    { key: 'route', label: 'common.labels.route' },
    { key: 'customer', label: 'common.labels.customer' },
    { key: 'vehicle', label: 'common.labels.vehicle' },
    { key: 'revenue', label: 'profitability.metrics.revenue', num: true },
    ...COST_BUCKETS.map((bucket) => ({ key: bucket, label: `profitability.buckets.${bucket}`, num: true })),
    { key: 'directCosts', label: 'profitability.table.totalDirectCosts', num: true },
    { key: 'margin', label: 'profitability.metrics.contributionMargin', num: true },
    { key: 'marginRatio', label: 'profitability.table.marginPct', num: true },
    { key: 'costPerKm', label: 'profitability.metrics.costPerKm', num: true },
    { key: 'maintenance', label: 'profitability.table.maintenance', num: true, muted: true },
  ]);

  protected readonly groupColumns: Column[] = [
    { key: 'trips', label: 'profitability.table.trips', num: true },
    { key: 'revenue', label: 'profitability.metrics.revenue', num: true },
    { key: 'directCosts', label: 'profitability.metrics.directCosts', num: true },
    { key: 'margin', label: 'profitability.metrics.contributionMargin', num: true },
    { key: 'marginRatio', label: 'profitability.table.marginPct', num: true },
    { key: 'costPerKm', label: 'profitability.metrics.costPerKm', num: true },
    { key: 'revenuePerKm', label: 'profitability.metrics.revenuePerKm', num: true },
  ];

  protected readonly tripRows = computed<TripTableRow[]>(() => {
    const focus = this.focus();
    const rows = focus ? this.rows().filter((row) => groupKeyOf(row.trip, focus.dimension) === focus.key) : this.rows();
    const mapped = rows.map((row) => ({
      id: row.trip.id,
      trip: row.trip,
      result: row.result,
      route: routeKey(row.trip),
      customer: this.directory.customerName(row.trip.customerId),
      plate: this.directory.plate(row.trip.vehicleId),
    }));
    const sort = this.sort();
    return sortBy(mapped, TRIP_SORT[sort.field] ?? TRIP_SORT['date'], sort.direction);
  });

  protected readonly pagedTripRows = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.tripRows().slice(start, start + this.pageSize());
  });

  protected readonly focusTotals = computed(() => {
    const focus = this.focus();
    if (!focus) return null;
    return totalsOf(this.rows().filter((row) => groupKeyOf(row.trip, focus.dimension) === focus.key));
  });

  protected readonly groupRowsView = computed<GroupTableRow[]>(() => {
    const view = this.view();
    if (view === 'trip') return [];
    const rows = this.groups()[view].map((group) => ({
      ...group,
      label: this.labelFor(view, group.key),
      sub: this.entitySub(view, group.key),
      link: this.linkFor(view, group.key),
    }));
    const sort = this.sort();
    return sortBy(rows, GROUP_SORT[sort.field] ?? GROUP_SORT['revenue'], sort.direction);
  });

  protected readonly resultCount = computed(() => (this.view() === 'trip' ? this.tripRows().length : this.groupRowsView().length));

  // ---- Actions ------------------------------------------------------------------------

  protected setView(view: GroupBy): void {
    this.view.set(view);
    if (view !== 'trip') this.focus.set(null);
    this.page.set(1);
    this.syncUrl();
  }

  protected setScope(scope: StatusScope): void {
    this.statusScope.set(scope);
    this.page.set(1);
    this.syncUrl();
  }

  protected setPeriod(period: PeriodSelection): void {
    this.period.set(period);
    this.page.set(1);
  }

  protected showAllTime(): void {
    this.setPeriod(resolvePeriod('allTime', this.clock.today()));
  }

  protected drillDown(dimension: Dimension, key: string): void {
    this.focus.set({ dimension, key, label: this.labelFor(dimension, key) });
    this.view.set('trip');
    this.page.set(1);
    this.syncUrl();
  }

  protected clearFocus(): void {
    this.focus.set(null);
    this.page.set(1);
  }

  protected openTrip(id: string): void {
    void this.router.navigate(['/trips', id]);
  }

  protected drillGroup(row: GroupTableRow): void {
    const view = this.view();
    if (view !== 'trip') this.drillDown(view, row.key);
  }

  protected openGroup(row: GroupTableRow): void {
    const view = this.view();
    if (view === 'trip') return;
    if (row.link) void this.router.navigate(row.link);
    else this.drillDown(view, row.key);
  }

  protected setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  protected toggleSort(field: string): void {
    const current = this.sort();
    if (current.field === field) this.sort.set({ field, direction: current.direction === 'asc' ? 'desc' : 'asc' });
    else this.sort.set({ field, direction: TEXT_FIELDS.includes(field) ? 'asc' : 'desc' });
    this.page.set(1);
  }

  protected sortIcon(field: string): IconName {
    const current = this.sort();
    if (current.field !== field) return 'chevrons-up-down';
    return current.direction === 'asc' ? 'arrow-up' : 'arrow-down';
  }

  protected ariaSort(field: string): 'ascending' | 'descending' | null {
    const current = this.sort();
    if (current.field !== field) return null;
    return current.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected exportCsv(): void {
    const t = (key: string, params?: Record<string, string | number>) => this.i18n.t(key, params);
    const reporting = this.reportingCurrency();
    const inCurrency = (label: string) => `${label} (${reporting})`;
    const view = this.view();
    const fileBase = `${t('profitability.csv.fileName')}-${t('profitability.groupBy.' + view).toLowerCase()}-${this.clock.today()}`;
    if (view === 'trip') {
      downloadCsv(
        fileBase,
        [
          t('common.labels.reference'),
          t('profitability.csv.departure'),
          t('common.labels.status'),
          t('common.labels.route'),
          t('common.labels.customer'),
          t('common.labels.vehicle'),
          t('profitability.csv.revenueOriginal'),
          t('profitability.csv.revenueCurrency'),
          t('common.money.rateUsed'),
          inCurrency(t('profitability.metrics.revenue')),
          ...COST_BUCKETS.map((bucket) => inCurrency(t(`profitability.buckets.${bucket}`))),
          inCurrency(t('profitability.table.totalDirectCosts')),
          inCurrency(t('profitability.metrics.contributionMargin')),
          t('profitability.table.marginPct'),
          t('profitability.csv.distanceKm'),
          inCurrency(t('profitability.metrics.costPerKm')),
          inCurrency(t('profitability.metrics.maintenanceAllocation')),
          t('profitability.labels.provisional'),
        ],
        this.tripRows().map((row) => [
          row.trip.reference,
          row.trip.plannedDeparture.slice(0, 10),
          t('trips.status.' + row.trip.status),
          row.route,
          row.customer,
          row.plate,
          row.trip.revenue.amount,
          row.trip.revenue.currency,
          this.currency.toReporting(row.trip.revenue).rate,
          row.result.revenue,
          ...COST_BUCKETS.map((bucket) => row.result.costs[bucket]),
          row.result.totalDirectCosts,
          row.result.contributionMargin,
          this.csvPercent(row.result.marginRatio),
          row.result.distanceKm,
          row.result.costPerKm,
          row.result.maintenanceAllocation,
          row.result.provisional ? t('common.labels.yes') : t('common.labels.no'),
        ]),
      );
    } else {
      downloadCsv(
        fileBase,
        [
          t('profitability.groupBy.' + view),
          t('profitability.table.trips'),
          inCurrency(t('profitability.metrics.revenue')),
          ...COST_BUCKETS.map((bucket) => inCurrency(t(`profitability.buckets.${bucket}`))),
          inCurrency(t('profitability.metrics.directCosts')),
          inCurrency(t('profitability.metrics.contributionMargin')),
          t('profitability.table.marginPct'),
          t('profitability.csv.distanceKm'),
          inCurrency(t('profitability.metrics.costPerKm')),
          inCurrency(t('profitability.metrics.revenuePerKm')),
          inCurrency(t('profitability.metrics.maintenanceAllocation')),
        ],
        this.groupRowsView().map((row) => [
          row.label,
          row.trips,
          row.revenue,
          ...COST_BUCKETS.map((bucket) => row.costs[bucket]),
          row.totalDirectCosts,
          row.contributionMargin,
          this.csvPercent(row.marginRatio),
          row.distanceKm,
          row.costPerKm,
          row.revenuePerKm,
          row.maintenanceAllocation,
        ]),
      );
    }
    this.toast.success(t('common.toasts.exported'));
  }

  // ---- View helpers -------------------------------------------------------------------

  protected tone(ratio: number | null): { cls: string; label: string } {
    const tone = marginTone(ratio);
    return { cls: `badge badge--${tone === 'neutral' ? 'outline' : tone}`, label: `profitability.tones.${marginToneLabel(tone)}` };
  }

  protected scopeLabel(): string {
    return this.i18n.t(`profitability.scope.${this.statusScope()}Short`);
  }

  private labelFor(dimension: Dimension, key: string): string {
    switch (dimension) {
      case 'customer':
        return this.directory.customerName(key);
      case 'vehicle':
        return this.directory.plate(key);
      case 'route':
        return key;
    }
  }

  private linkFor(dimension: Dimension, key: string): string[] | null {
    if (dimension === 'customer') return ['/customers', key];
    if (dimension === 'vehicle') return ['/vehicles', key];
    return null;
  }

  private entitySub(dimension: Dimension, key: string): string | null {
    if (dimension === 'customer') return this.directory.customer(key)?.code ?? null;
    if (dimension === 'vehicle') {
      const vehicle = this.directory.vehicle(key);
      return vehicle ? `${vehicle.fleetNumber} · ${vehicle.make} ${vehicle.model}` : null;
    }
    return null;
  }

  private groupSub(group: ProfitabilityGroup): string {
    return this.i18n.t('profitability.ranking.sub', {
      count: group.trips,
      revenue: this.format.reporting(group.revenue, { compact: true }),
    });
  }

  private csvPercent(ratio: number | null): number | null {
    return ratio === null ? null : Math.round(ratio * 1000) / 10;
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      queryParams: { groupBy: this.view() === 'trip' ? null : this.view(), scope: this.statusScope() === 'provisional' ? 'provisional' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
