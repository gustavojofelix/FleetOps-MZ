import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { paginate } from '../../../core/data-access/query-utils';
import { PagedResult, SortSpec } from '../../../core/data-access/query.model';
import { FuelRepository } from '../../../core/data-access/repositories';
import { FuelAnalysis } from '../../../core/domain/fuel-analysis';
import { CurrencyService } from '../../../core/formatting/currency.service';
import { isWithinRange } from '../../../core/formatting/date-utils';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { FuelRecord } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FleetAnalytics } from '../../../core/services/fleet-analytics.service';
import { BarChart } from '../../../shared/ui/charts/bar-chart/bar-chart';
import { ChartSeries } from '../../../shared/ui/charts/chart.model';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { Dropdown, DropdownTrigger } from '../../../shared/ui/dropdown/dropdown';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiCard } from '../../../shared/ui/kpi-card/kpi-card';
import { Modal } from '../../../shared/ui/modal/modal';
import { Money } from '../../../shared/ui/money/money';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { PeriodFilter } from '../../../shared/ui/period-filter/period-filter';
import { SimulatedNotice } from '../../../shared/ui/simulated-notice/simulated-notice';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TooltipDirective } from '../../../shared/ui/tooltip/tooltip.directive';
import { downloadCsv } from '../../../shared/utils/csv';
import { createListState } from '../../../shared/utils/list-state';
import { PeriodSelection, resolvePeriod } from '../../../shared/utils/period';
import { consumptionByVehicle, fuelChartMonths, monthlyFuel, summariseFuel } from '../fuel-calculations';
import { FuelFacade } from '../fuel.facade';
import { FuelForm, FuelFormDefaults, FuelSaveResult } from '../fuel-form/fuel-form';

type ChartMetric = 'litres' | 'cost';

interface FuelListParams {
  search: string;
  vehicleId: string | null;
  driverId: string | null;
  tripId: string | null;
  from: string | null;
  to: string | null;
  sort: SortSpec | null;
  page: number;
  pageSize: number;
  /** Present only when the "to review" filter is on (the repository cannot filter by analysis). */
  analysis: ReadonlyMap<string, FuelAnalysis> | null;
  version: number;
}

@Component({
  selector: 'app-fuel-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    PeriodFilter,
    KpiCard,
    SimulatedNotice,
    BarChart,
    EmptyState,
    Icon,
    Money,
    Pagination,
    TableSkeleton,
    Dropdown,
    DropdownTrigger,
    Modal,
    TooltipDirective,
    FuelForm,
  ],
  templateUrl: './fuel-page.html',
  styleUrl: './fuel-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FuelPage {
  private readonly repository = inject(FuelRepository);
  private readonly facade = inject(FuelFacade);
  private readonly analytics = inject(FleetAnalytics);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly clock = inject(ClockService);
  protected readonly currency = inject(CurrencyService);
  protected readonly directory = inject(EntityDirectory);

  /** Query params bound by the router (deep links from vehicles, trips, dashboard). */
  readonly vehicleId = input<string | undefined>();
  readonly driverId = input<string | undefined>();
  readonly tripId = input<string | undefined>();
  readonly warnings = input<string | undefined>();

  protected readonly list = createListState({ pageSize: 10, sort: { field: 'timestamp', direction: 'desc' } });
  protected readonly vehicleFilter = linkedSignal<string | null>(() => this.vehicleId() || null);
  protected readonly driverFilter = linkedSignal<string | null>(() => this.driverId() || null);
  protected readonly tripFilter = linkedSignal<string | null>(() => this.tripId() || null);
  protected readonly warningsOnly = linkedSignal<boolean>(() => this.warnings() === '1' || this.warnings() === 'true');
  /** A trip context shows the whole trip, whatever its dates. */
  protected readonly period = linkedSignal<PeriodSelection>(() =>
    resolvePeriod(this.tripId() ? 'allTime' : 'last90Days', this.clock.today()),
  );
  protected readonly chartMetric = signal<ChartMetric>('litres');
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<FuelRecord | null>(null);
  protected readonly formDefaults = signal<FuelFormDefaults | null>(null);

  protected readonly analysis = this.analytics.fuelAnalysis;

  protected readonly query = createQuery(
    (): FuelListParams => ({
      search: this.list.search(),
      vehicleId: this.vehicleFilter(),
      driverId: this.driverFilter(),
      tripId: this.tripFilter(),
      from: this.period().from,
      to: this.period().to,
      sort: this.list.sort(),
      page: this.list.page(),
      pageSize: this.list.pageSize(),
      analysis: this.warningsOnly() ? this.analysis() : null,
      version: this.repository.changes(),
    }),
    (params) => this.load(params),
  );

  protected readonly hasFilters = computed(
    () => !!this.vehicleFilter() || !!this.driverFilter() || !!this.tripFilter() || this.warningsOnly() || this.list.hasSearch(),
  );

  /** KPI link: same filters with the "to review" toggle flipped. */
  protected readonly warningsLinkParams = computed<Record<string, string>>(() => {
    const params: Record<string, string> = {};
    const vehicleId = this.vehicleFilter();
    const driverId = this.driverFilter();
    const tripId = this.tripFilter();
    if (vehicleId) params['vehicleId'] = vehicleId;
    if (driverId) params['driverId'] = driverId;
    if (tripId) params['tripId'] = tripId;
    if (!this.warningsOnly()) params['warnings'] = '1';
    return params;
  });

  protected readonly contextTrip = computed(() => this.directory.trip(this.tripFilter()));

  /** Records behind the summary: period + vehicle / driver / trip (not search or the review toggle). */
  private readonly scoped = computed(() => {
    const { from, to } = this.period();
    const vehicleId = this.vehicleFilter();
    const driverId = this.driverFilter();
    const tripId = this.tripFilter();
    return this.directory
      .fuel()
      .filter(
        (record) =>
          (!vehicleId || record.vehicleId === vehicleId) &&
          (!driverId || record.driverId === driverId) &&
          (!tripId || record.tripId === tripId) &&
          isWithinRange(record.timestamp, from, to),
      );
  });

  protected readonly summary = computed(() => summariseFuel(this.scoped(), this.analysis(), this.currency.reporting()));

  protected readonly chart = computed(() => {
    const records = this.scoped();
    const { from, to } = this.period();
    const months = fuelChartMonths(
      records.map((record) => record.timestamp),
      from,
      to,
    );
    const monthly = monthlyFuel(records, months, this.currency.reporting());
    const metric = this.chartMetric();
    const series: ChartSeries[] = [
      {
        key: metric,
        label: this.i18n.t(metric === 'litres' ? 'fuel.chart.litres' : 'fuel.chart.cost'),
        values: monthly.map((entry) => (metric === 'litres' ? entry.litres : entry.cost)),
        color: metric === 'litres' ? 1 : 2,
      },
    ];
    return {
      categories: months.map((month) => this.format.date(`${month}-01`, 'month')),
      series,
      empty: records.length === 0,
    };
  });

  protected readonly formatChartValue = (value: number): string =>
    this.chartMetric() === 'litres' ? this.format.volume(value, 0) : this.format.reporting(value, { wholeUnits: true });
  protected readonly formatChartAxis = (value: number): string =>
    this.chartMetric() === 'litres' ? this.format.compact(value) : this.format.reporting(value, { compact: true });

  /** Consumption ranking with a shared scale so bars are comparable. */
  protected readonly ranking = computed(() => {
    const rows = consumptionByVehicle(this.scoped(), this.analysis(), this.directory.vehicles());
    const scale = Math.max(1, ...rows.map((row) => Math.max(row.average, row.expected))) * 1.1;
    return rows.map((row) => ({
      ...row,
      plate: this.directory.plate(row.vehicleId),
      valuePct: Math.min(100, (row.average / scale) * 100),
      referencePct: Math.min(100, (row.expected / scale) * 100),
    }));
  });

  protected readonly vehicleOptions = computed(() =>
    [...this.directory.vehicles()].sort((a, b) => a.plateNumber.localeCompare(b.plateNumber)),
  );

  protected readonly driverOptions = computed(() =>
    this.directory
      .drivers()
      .map((d) => ({ id: d.id, label: `${d.firstName} ${d.lastName}` }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  /** Trips that have fuel records (of the selected vehicle, when one is chosen), most recent first. */
  protected readonly tripOptions = computed(() => {
    const withFuel = new Set(this.directory.fuel().map((record) => record.tripId));
    const vehicleId = this.vehicleFilter();
    return this.directory
      .trips()
      .filter((trip) => (withFuel.has(trip.id) || trip.id === this.tripFilter()) && (!vehicleId || trip.vehicleId === vehicleId))
      .sort((a, b) => b.plannedDeparture.localeCompare(a.plannedDeparture));
  });

  protected setVehicle(event: Event): void {
    this.vehicleFilter.set((event.target as HTMLSelectElement).value || null);
    const trip = this.contextTrip();
    if (trip && this.vehicleFilter() && trip.vehicleId !== this.vehicleFilter()) this.tripFilter.set(null);
    this.applyFilters();
  }

  protected setDriver(event: Event): void {
    this.driverFilter.set((event.target as HTMLSelectElement).value || null);
    this.applyFilters();
  }

  protected setTrip(event: Event): void {
    this.tripFilter.set((event.target as HTMLSelectElement).value || null);
    this.applyFilters();
  }

  protected clearTrip(): void {
    this.tripFilter.set(null);
    this.applyFilters();
  }

  protected setWarningsOnly(value: boolean): void {
    this.warningsOnly.set(value);
    this.applyFilters();
  }

  protected setPeriod(period: PeriodSelection): void {
    this.period.set(period);
    this.list.resetPage();
  }

  protected clearFilters(): void {
    this.vehicleFilter.set(null);
    this.driverFilter.set(null);
    this.tripFilter.set(null);
    this.warningsOnly.set(false);
    this.list.clearSearch();
    this.syncUrl();
  }

  protected toggleExpanded(id: string): void {
    const next = new Set(this.expanded());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.expanded.set(next);
  }

  protected openCreate(): void {
    const trip = this.contextTrip();
    const vehicleId = trip?.vehicleId ?? this.vehicleFilter();
    this.editing.set(null);
    this.formDefaults.set({
      vehicleId,
      tripId: trip?.id ?? null,
      driverId: trip?.driverId ?? this.driverFilter() ?? this.directory.vehicle(vehicleId)?.assignedDriverId ?? null,
    });
    this.formOpen.set(true);
  }

  protected openEdit(record: FuelRecord): void {
    this.editing.set(record);
    this.formDefaults.set(null);
    this.formOpen.set(true);
  }

  protected onSaved(result: FuelSaveResult): void {
    this.formOpen.set(false);
    const key = !result.created ? 'fuel.toasts.updated' : result.warningCount ? 'fuel.toasts.createdWithWarnings' : 'fuel.toasts.created';
    const message = this.i18n.t(key, { reference: result.record.reference });
    if (result.created && result.warningCount) this.toast.warning(message);
    else this.toast.success(message);
  }

  protected async remove(record: FuelRecord): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('fuel.confirmDelete.title', { reference: record.reference }),
      message: this.i18n.t('fuel.confirmDelete.message'),
      confirmLabel: this.i18n.t('common.actions.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await this.facade.delete(record.id);
      this.toast.success(this.i18n.t('fuel.toasts.deleted', { reference: record.reference }));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  protected async exportCsv(): Promise<void> {
    const result = await this.load({ ...this.currentParams(), page: 1, pageSize: 0 });
    const t = (key: string) => this.i18n.t(key);
    const analysis = this.analysis();
    downloadCsv(
      `${t('fuel.csv.fileName')}-${this.clock.today()}`,
      [
        t('fuel.fields.reference'),
        t('fuel.fields.timestamp'),
        t('fuel.fields.vehicle'),
        t('fuel.fields.driver'),
        t('fuel.fields.trip'),
        t('fuel.fields.station'),
        t('fuel.fields.location'),
        t('fuel.fields.odometer'),
        t('fuel.fields.litres'),
        t('fuel.fields.pricePerLitre'),
        t('fuel.fields.total'),
        t('fuel.fields.currency'),
        t('fuel.fields.fullTank'),
        t('fuel.columns.consumption'),
        t('fuel.csv.warnings'),
        t('fuel.fields.receipt'),
      ],
      result.items.map((record) => {
        const entry = analysis.get(record.id);
        return [
          record.reference,
          this.format.date(record.timestamp, 'datetime'),
          this.directory.plate(record.vehicleId),
          record.driverId ? this.directory.driverName(record.driverId) : '',
          record.tripId ? this.directory.tripReference(record.tripId) : '',
          record.station,
          record.location,
          record.odometerKm,
          record.litres,
          record.pricePerLitre.amount,
          record.totalAmount.amount,
          record.totalAmount.currency,
          t(record.fullTank ? 'common.labels.yes' : 'common.labels.no'),
          entry?.consumptionL100km ?? '',
          (entry?.warnings ?? []).map((w) => this.i18n.t(`fuel.warnings.${w.code}`, w.params)).join(' | '),
          record.receiptFileName ?? '',
        ];
      }),
    );
    this.toast.success(t('common.toasts.exported'));
  }

  /** Translated warnings of a record, for the review badge tooltip. */
  protected warningSummary(recordId: string): string {
    return (this.analysis().get(recordId)?.warnings ?? [])
      .map((warning) => this.i18n.t(`fuel.warnings.${warning.code}`, warning.params))
      .join(' • ');
  }

  protected consumptionText(value: number | null): string {
    return value === null ? '—' : `${this.format.number(value, 1)} ${this.i18n.t('common.units.l100km')}`;
  }

  protected deviationText(deviation: number | null): string {
    return this.format.percent(Math.abs(deviation ?? 0), 0);
  }

  private currentParams(): Omit<FuelListParams, 'page' | 'pageSize'> {
    return {
      search: this.list.search(),
      vehicleId: this.vehicleFilter(),
      driverId: this.driverFilter(),
      tripId: this.tripFilter(),
      from: this.period().from,
      to: this.period().to,
      sort: this.list.sort(),
      analysis: this.warningsOnly() ? this.analysis() : null,
      version: this.repository.changes(),
    };
  }

  private async load(params: FuelListParams): Promise<PagedResult<FuelRecord>> {
    const filters = {
      search: params.search,
      vehicleId: params.vehicleId,
      driverId: params.driverId,
      tripId: params.tripId,
      from: params.from,
      to: params.to,
      sort: params.sort,
    };
    const paging = { page: params.page, pageSize: params.pageSize || undefined };
    const analysis = params.analysis;
    if (!analysis) return this.repository.list({ ...filters, ...paging });
    // The repository cannot filter by analysis: fetch every match, keep flagged rows, page locally.
    const all = await this.repository.list(filters);
    return paginate(
      all.items.filter((record) => (analysis.get(record.id)?.warnings.length ?? 0) > 0),
      paging,
    );
  }

  private applyFilters(): void {
    this.list.resetPage();
    this.syncUrl();
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      queryParams: {
        vehicleId: this.vehicleFilter(),
        driverId: this.driverFilter(),
        tripId: this.tripFilter(),
        warnings: this.warningsOnly() ? '1' : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
