import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { paginate } from '../../../core/data-access/query-utils';
import { MaintenanceRepository } from '../../../core/data-access/repositories';
import { maintenanceDisplayStatus, maintenanceTotalCost } from '../../../core/domain/maintenance-rules';
import { CurrencyService } from '../../../core/formatting/currency.service';
import { addDays, isWithinRange, monthKey, monthsInRange } from '../../../core/formatting/date-utils';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import {
  MAINTENANCE_DISPLAY_STATUSES,
  MAINTENANCE_TYPES,
  MaintenanceDisplayStatus,
  MaintenanceRecord,
  MaintenanceType,
} from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { BarChart } from '../../../shared/ui/charts/bar-chart/bar-chart';
import { ChartSeries, DonutSlice } from '../../../shared/ui/charts/chart.model';
import { DonutChart } from '../../../shared/ui/charts/donut-chart/donut-chart';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { Dropdown, DropdownTrigger } from '../../../shared/ui/dropdown/dropdown';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiCard } from '../../../shared/ui/kpi-card/kpi-card';
import { Modal } from '../../../shared/ui/modal/modal';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { PeriodFilter } from '../../../shared/ui/period-filter/period-filter';
import { SimulatedNotice } from '../../../shared/ui/simulated-notice/simulated-notice';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { downloadCsv } from '../../../shared/utils/csv';
import { createListState } from '../../../shared/utils/list-state';
import { PeriodPreset, PeriodSelection, resolvePeriod } from '../../../shared/utils/period';
import { MaintenanceCompleteDialog } from '../maintenance-complete-dialog/maintenance-complete-dialog';
import { MaintenanceFacade, MaintenanceResult, ServiceForecast, UpcomingItem, VehicleOnTripError } from '../maintenance.facade';
import { MaintenanceForm, MaintenancePreset } from '../maintenance-form/maintenance-form';

/** "open" (default) = overdue + scheduled + in progress; "all" = every status. */
type MaintenanceTab = 'open' | 'all' | MaintenanceDisplayStatus;

interface WorkOrderRow {
  record: MaintenanceRecord;
  status: MaintenanceDisplayStatus;
  total: number;
}

const OPEN_STATUSES: readonly MaintenanceDisplayStatus[] = ['overdue', 'scheduled', 'in_progress'];
const UPCOMING_LIMIT = 6;
const LIST_PERIOD_PRESETS: readonly PeriodPreset[] = ['allTime', 'last30Days', 'last90Days', 'thisMonth', 'lastMonth', 'last6Months', 'yearToDate', 'custom'];
const OVERVIEW_PERIOD_PRESETS: readonly PeriodPreset[] = ['last30Days', 'last90Days', 'thisMonth', 'lastMonth', 'last6Months', 'yearToDate', 'allTime', 'custom'];

@Component({
  selector: 'app-maintenance-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    KpiCard,
    StatusBadge,
    EmptyState,
    Icon,
    Pagination,
    PeriodFilter,
    SimulatedNotice,
    TableSkeleton,
    Dropdown,
    DropdownTrigger,
    Modal,
    BarChart,
    DonutChart,
    MaintenanceForm,
    MaintenanceCompleteDialog,
  ],
  templateUrl: './maintenance-page.html',
  styleUrl: './maintenance-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaintenancePage {
  private readonly repository = inject(MaintenanceRepository);
  private readonly facade = inject(MaintenanceFacade);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly currency = inject(CurrencyService);
  private readonly clock = inject(ClockService);
  protected readonly directory = inject(EntityDirectory);

  /** Query params bound by the router (dashboard / notification deep links). */
  readonly status = input<string | undefined>();
  readonly vehicleId = input<string | undefined>();

  protected readonly displayStatuses = MAINTENANCE_DISPLAY_STATUSES;
  protected readonly types = MAINTENANCE_TYPES;
  protected readonly listPeriodPresets = LIST_PERIOD_PRESETS;
  protected readonly overviewPeriodPresets = OVERVIEW_PERIOD_PRESETS;
  protected readonly today = this.clock.today();

  protected readonly list = createListState({ pageSize: 10, sort: { field: 'plannedDate', direction: 'desc' } });
  protected readonly tab = linkedSignal<MaintenanceTab>(() => this.asTab(this.status()));
  protected readonly vehicleFilter = linkedSignal<string | null>(() => this.vehicleId() || null);
  protected readonly typeFilter = signal<MaintenanceType | null>(null);
  protected readonly listPeriod = signal<PeriodSelection>(resolvePeriod('allTime', this.today));
  protected readonly period = signal<PeriodSelection>(resolvePeriod('last6Months', this.today));

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<MaintenanceRecord | null>(null);
  protected readonly preset = signal<MaintenancePreset | null>(null);
  protected readonly completing = signal<MaintenanceRecord | null>(null);
  protected readonly busyId = signal<string | null>(null);

  protected readonly query = createQuery(
    () => ({
      search: this.list.search(),
      tab: this.tab(),
      vehicleId: this.vehicleFilter(),
      type: this.typeFilter(),
      from: this.listPeriod().from,
      to: this.listPeriod().to,
      sort: this.list.sort(),
      page: this.list.page(),
      pageSize: this.list.pageSize(),
      version: this.repository.changes(),
    }),
    async (params) => {
      const tab = params.tab;
      const result = await this.repository.list({
        search: params.search,
        vehicleId: params.vehicleId,
        type: params.type,
        from: params.from,
        to: params.to,
        sort: params.sort,
        displayStatus: tab === 'open' || tab === 'all' ? null : tab,
      });
      const today = this.clock.today();
      const items = tab === 'open' ? result.items.filter((m) => OPEN_STATUSES.includes(maintenanceDisplayStatus(m, today))) : result.items;
      return paginate(items, { page: params.page, pageSize: params.pageSize });
    },
  );

  protected readonly rows = computed<WorkOrderRow[]>(() =>
    (this.query.value()?.items ?? []).map((record) => ({
      record,
      status: maintenanceDisplayStatus(record, this.today),
      total: maintenanceTotalCost(record),
    })),
  );

  /** Tab counts follow the vehicle / type filters so deep links stay consistent. */
  protected readonly counts = computed(() => {
    const vehicleId = this.vehicleFilter();
    const type = this.typeFilter();
    const byStatus = new Map<MaintenanceDisplayStatus, number>();
    let total = 0;
    for (const record of this.directory.maintenance()) {
      if (vehicleId && record.vehicleId !== vehicleId) continue;
      if (type && record.type !== type) continue;
      const status = maintenanceDisplayStatus(record, this.today);
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
      total += 1;
    }
    const open = OPEN_STATUSES.reduce((sum, status) => sum + (byStatus.get(status) ?? 0), 0);
    return { total, open, byStatus };
  });

  protected readonly hasFilters = computed(
    () => !!this.vehicleFilter() || !!this.typeFilter() || this.list.hasSearch() || this.listPeriod().preset !== 'allTime',
  );

  // ---- Overview (fleet-wide) ----

  private readonly completedInPeriod = computed(() => {
    const { from, to } = this.period();
    return this.directory
      .maintenance()
      .filter((m) => m.status === 'completed' && m.completedDate && isWithinRange(m.completedDate, from, to));
  });

  protected readonly kpis = computed(() => {
    const records = this.directory.maintenance();
    const horizon = addDays(this.today, 30);
    const statuses = records.map((m) => maintenanceDisplayStatus(m, this.today));
    const inProgress = records.filter((m) => m.status === 'in_progress');
    const completed = this.completedInPeriod();
    return {
      overdue: statuses.filter((s) => s === 'overdue').length,
      upcoming: records.filter((m) => m.status === 'scheduled' && m.plannedDate >= this.today && m.plannedDate <= horizon).length,
      horizon,
      vehiclesInWorkshop: new Set(inProgress.map((m) => m.vehicleId)).size,
      inProgress: inProgress.length,
      cost: this.currency.sumToReporting(completed.map((m) => ({ amount: maintenanceTotalCost(m), currency: m.currency }))),
      completedCount: completed.length,
      downtime: completed.reduce((sum, m) => sum + (m.downtimeHours || 0), 0),
    };
  });

  /** Always the last six months, independent of the period selector. */
  protected readonly monthly = computed(() => {
    const range = resolvePeriod('last6Months', this.today);
    const months = monthsInRange(range.from ?? this.today, this.today);
    const totals = new Map<string, number>(months.map((month) => [month, 0]));
    for (const m of this.directory.maintenance()) {
      if (m.status !== 'completed' || !m.completedDate) continue;
      const key = monthKey(m.completedDate);
      if (!totals.has(key)) continue;
      totals.set(key, (totals.get(key) ?? 0) + this.currency.toReporting({ amount: maintenanceTotalCost(m), currency: m.currency }).converted.amount);
    }
    this.i18n.revision();
    const categories = months.map((month) => this.format.date(`${month}-01`, 'month'));
    const series: ChartSeries[] = [{ key: 'cost', label: this.i18n.t('maintenance.charts.series'), values: months.map((m) => totals.get(m) ?? 0), color: 1 }];
    return { categories, series, hasData: series[0].values.some((v) => v > 0) };
  });

  protected readonly byType = computed<DonutSlice[]>(() => {
    this.i18n.revision();
    const totals = new Map<MaintenanceType, number>();
    for (const m of this.completedInPeriod()) {
      const value = this.currency.toReporting({ amount: maintenanceTotalCost(m), currency: m.currency }).converted.amount;
      totals.set(m.type, (totals.get(m.type) ?? 0) + value);
    }
    return MAINTENANCE_TYPES.map((type, index) => ({
      key: type,
      label: this.i18n.t(`maintenance.types.${type}`),
      value: totals.get(type) ?? 0,
      color: (index + 1) as DonutSlice['color'],
    })).filter((slice) => slice.value > 0);
  });

  protected readonly upcoming = computed(() => this.facade.upcoming().slice(0, UPCOMING_LIMIT));
  protected readonly upcomingTotal = computed(() => this.facade.upcoming().length);
  protected readonly forecasts = this.facade.forecasts;

  protected readonly formatReporting = (value: number): string => this.format.reporting(value, { compact: true });
  protected readonly formatReportingFull = (value: number): string => this.format.reporting(value, { wholeUnits: true });

  // ---- Filters ----

  protected setTab(tab: MaintenanceTab): void {
    this.tab.set(tab);
    this.list.resetPage();
    this.syncUrl();
  }

  protected setVehicle(event: Event): void {
    this.vehicleFilter.set((event.target as HTMLSelectElement).value || null);
    this.list.resetPage();
    this.syncUrl();
  }

  protected setType(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as MaintenanceType;
    this.typeFilter.set(MAINTENANCE_TYPES.includes(value) ? value : null);
    this.list.resetPage();
  }

  protected setListPeriod(period: PeriodSelection): void {
    this.listPeriod.set(period);
    this.list.resetPage();
  }

  protected clearFilters(): void {
    this.vehicleFilter.set(null);
    this.typeFilter.set(null);
    this.listPeriod.set(resolvePeriod('allTime', this.today));
    this.list.clearSearch();
    this.syncUrl();
  }

  // ---- Actions ----

  protected openCreate(preset: MaintenancePreset | null = null): void {
    this.editing.set(null);
    this.preset.set(preset ?? (this.vehicleFilter() ? { vehicleId: this.vehicleFilter()! } : null));
    this.formOpen.set(true);
  }

  protected openEdit(record: MaintenanceRecord): void {
    this.preset.set(null);
    this.editing.set(record);
    this.formOpen.set(true);
  }

  protected scheduleForecast(forecast: ServiceForecast): void {
    this.openCreate({
      vehicleId: forecast.vehicleId,
      type: 'preventive',
      workshop: forecast.source.workshop,
      plannedDate: forecast.dueDate && forecast.dueDate > this.today ? forecast.dueDate : this.today,
    });
  }

  protected onSaved(result: MaintenanceResult, created: boolean): void {
    this.formOpen.set(false);
    this.toast.success(this.i18n.t(created ? 'maintenance.toasts.created' : 'maintenance.toasts.updated', { number: result.record.workOrderNumber }));
    this.announceVehicle(result);
  }

  protected onCompleted(result: MaintenanceResult): void {
    this.completing.set(null);
    this.toast.success(this.i18n.t('maintenance.toasts.completed', { number: result.record.workOrderNumber }));
    this.announceVehicle(result);
  }

  protected async start(record: MaintenanceRecord): Promise<void> {
    this.busyId.set(record.id);
    try {
      const result = await this.facade.start(record);
      this.toast.success(
        this.i18n.t('maintenance.toasts.started', { number: record.workOrderNumber, plate: this.directory.plate(record.vehicleId) }),
      );
      this.announceVehicle(result);
    } catch (error) {
      this.handleError(error);
    } finally {
      this.busyId.set(null);
    }
  }

  protected async cancel(record: MaintenanceRecord): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('maintenance.confirmCancel.title', { number: record.workOrderNumber }),
      message: this.i18n.t('maintenance.confirmCancel.message'),
      confirmLabel: this.i18n.t('maintenance.confirmCancel.confirm'),
    });
    if (!confirmed) return;
    try {
      const result = await this.facade.cancel(record);
      this.toast.success(this.i18n.t('maintenance.toasts.cancelled', { number: record.workOrderNumber }));
      this.announceVehicle(result);
    } catch (error) {
      this.handleError(error);
    }
  }

  protected async remove(record: MaintenanceRecord): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('maintenance.confirmDelete.title', { number: record.workOrderNumber }),
      message: this.i18n.t('maintenance.confirmDelete.message'),
      confirmLabel: this.i18n.t('common.actions.delete'),
    });
    if (!confirmed) return;
    try {
      const released = await this.facade.delete(record);
      this.toast.success(this.i18n.t('maintenance.toasts.deleted', { number: record.workOrderNumber }));
      if (released) this.toast.info(this.i18n.t('maintenance.toasts.vehicleReleased', { plate: released.plateNumber }));
    } catch (error) {
      this.handleError(error);
    }
  }

  protected async exportCsv(): Promise<void> {
    const tab = this.tab();
    const result = await this.repository.list({
      search: this.list.search(),
      vehicleId: this.vehicleFilter(),
      type: this.typeFilter(),
      from: this.listPeriod().from,
      to: this.listPeriod().to,
      sort: this.list.sort(),
      displayStatus: tab === 'open' || tab === 'all' ? null : tab,
    });
    const items = tab === 'open' ? result.items.filter((m) => OPEN_STATUSES.includes(maintenanceDisplayStatus(m, this.today))) : result.items;
    const t = (key: string) => this.i18n.t(key);
    downloadCsv(
      `${t('maintenance.csv.fileName')}-${this.today}`,
      [
        t('maintenance.fields.workOrderNumber'),
        t('maintenance.fields.description'),
        t('maintenance.fields.vehicle'),
        t('maintenance.fields.type'),
        t('maintenance.fields.workshop'),
        t('maintenance.fields.status'),
        t('maintenance.fields.plannedDate'),
        t('maintenance.fields.startedDate'),
        t('maintenance.fields.completedDate'),
        t('maintenance.fields.odometer'),
        t('maintenance.fields.currency'),
        t('maintenance.fields.partsCost'),
        t('maintenance.fields.labourCost'),
        t('maintenance.fields.totalCost'),
        t('maintenance.fields.downtimeHours'),
        t('maintenance.fields.nextServiceKm'),
        t('maintenance.fields.nextServiceDate'),
        t('maintenance.fields.notes'),
      ],
      items.map((m) => [
        m.workOrderNumber,
        m.description,
        this.directory.plate(m.vehicleId),
        t(`maintenance.types.${m.type}`),
        m.workshop,
        t(`maintenance.status.${maintenanceDisplayStatus(m, this.today)}`),
        m.plannedDate,
        m.startedDate ?? '',
        m.completedDate ?? '',
        m.odometerKm,
        m.currency,
        m.partsCost,
        m.labourCost,
        maintenanceTotalCost(m),
        m.downtimeHours,
        m.nextServiceKm ?? '',
        m.nextServiceDate ?? '',
        m.notes,
      ]),
    );
    this.toast.success(t('common.toasts.exported'));
  }

  // ---- Presentation helpers ----

  protected subtitle(): string {
    const counts = this.counts();
    return this.i18n.t('maintenance.subtitle', {
      open: counts.open,
      overdue: counts.byStatus.get('overdue') ?? 0,
      workshop: this.kpis().vehiclesInWorkshop,
    });
  }

  protected upcomingLabel(item: UpcomingItem): string {
    if (item.days === 0) return this.i18n.t('maintenance.upcoming.dueToday');
    return item.days < 0
      ? this.i18n.t('maintenance.upcoming.overdueBy', { count: -item.days })
      : this.i18n.t('maintenance.upcoming.dueIn', { count: item.days });
  }

  protected forecastLabel(forecast: ServiceForecast): string {
    const parts: string[] = [];
    if (forecast.dueDate) parts.push(this.i18n.t('maintenance.upcoming.forecastByDate', { date: this.format.date(forecast.dueDate) }));
    if (forecast.kmLeft !== null) {
      parts.push(
        forecast.kmLeft >= 0
          ? this.i18n.t('maintenance.upcoming.forecastByKm', { km: this.format.distance(forecast.kmLeft) })
          : this.i18n.t('maintenance.upcoming.forecastKmPassed', { km: this.format.distance(-forecast.kmLeft) }),
      );
    }
    return parts.join(' · ');
  }

  protected canStart(row: WorkOrderRow): boolean {
    return row.record.status === 'scheduled';
  }

  private announceVehicle(result: MaintenanceResult): void {
    if (result.vehicleReleased) this.toast.info(this.i18n.t('maintenance.toasts.vehicleReleased', { plate: result.vehicleReleased.plateNumber }));
  }

  private handleError(error: unknown): void {
    if (error instanceof VehicleOnTripError) {
      this.toast.warning(this.i18n.t('maintenance.toasts.blockedByTrip', { plate: error.vehicle.plateNumber, trip: error.trip.reference }));
    } else {
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  private syncUrl(): void {
    const tab = this.tab();
    void this.router.navigate([], {
      queryParams: { status: tab === 'open' ? null : tab, vehicleId: this.vehicleFilter() },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private asTab(value: string | null | undefined): MaintenanceTab {
    if (value === 'all') return 'all';
    return MAINTENANCE_DISPLAY_STATUSES.includes(value as MaintenanceDisplayStatus) ? (value as MaintenanceDisplayStatus) : 'open';
  }
}
