import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UserRepository } from '../../../core/data-access/repositories';
import { CurrencyService } from '../../../core/formatting/currency.service';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FleetAnalytics } from '../../../core/services/fleet-analytics.service';
import { CompanySettingsService } from '../../../core/state/company-settings.service';
import { BarChart } from '../../../shared/ui/charts/bar-chart/bar-chart';
import { ChartSeries, DonutSlice, ValueFormatter } from '../../../shared/ui/charts/chart.model';
import { DonutChart } from '../../../shared/ui/charts/donut-chart/donut-chart';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ExpiryBadge } from '../../../shared/ui/expiry-badge/expiry-badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { IconName } from '../../../shared/ui/icon/icon-registry';
import { KpiCard } from '../../../shared/ui/kpi-card/kpi-card';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { PeriodFilter } from '../../../shared/ui/period-filter/period-filter';
import { SimulatedNotice } from '../../../shared/ui/simulated-notice/simulated-notice';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { PeriodSelection, previousPeriod, resolvePeriod } from '../../../shared/utils/period';
import { AlertView, DashboardAlerts } from '../dashboard-alerts/dashboard-alerts';
import {
  AlertKind,
  DashboardSource,
  OPERATING_COST_BUCKETS,
  activeTrips,
  buildAlerts,
  expiringDocuments,
  fleetSnapshot,
  monthlyTrend,
  percentChange,
  periodMetrics,
  recentTrips,
  trailingMonths,
  upcomingMaintenance,
} from '../dashboard-metrics';

type DeltaTone = 'positive' | 'negative' | 'neutral';

interface KpiView {
  key: string;
  label: string;
  value: string;
  icon: IconName;
  hint: string | null;
  delta: string | null;
  deltaTone: DeltaTone;
  link: string;
  queryParams: Record<string, string> | null;
}

const PANEL_LIMIT = 5;
const TREND_MONTHS = 6;

const ALERT_ICONS: Record<AlertKind, IconName> = {
  trip_delayed: 'timer',
  maintenance_overdue: 'wrench',
  documents_expired: 'file-x',
  documents_expiring: 'file-text',
  licence_expired: 'id-card',
  licence_expiring: 'id-card',
  fuel_warnings: 'fuel',
  expenses_pending: 'receipt',
};

@Component({
  selector: 'app-dashboard-page',
  imports: [
    RouterLink,
    NgTemplateOutlet,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    PeriodFilter,
    KpiCard,
    BarChart,
    DonutChart,
    EmptyState,
    ExpiryBadge,
    Icon,
    SimulatedNotice,
    StatusBadge,
    DashboardAlerts,
  ],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  protected readonly directory = inject(EntityDirectory);
  private readonly analytics = inject(FleetAnalytics);
  private readonly currency = inject(CurrencyService);
  private readonly settings = inject(CompanySettingsService);
  private readonly clock = inject(ClockService);
  private readonly format = inject(FormatService);
  private readonly i18n = inject(TranslationService);
  private readonly users = inject(UserRepository);

  protected readonly today = this.clock.today();
  protected readonly period = signal<PeriodSelection>(resolvePeriod('last30Days', this.today));
  protected readonly loading = this.directory.loading;
  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly kpiSkeletons = [0, 1, 2, 3, 4, 5, 6, 7];
  protected readonly expiryWarningDays = this.settings.expiryWarningDays;
  protected readonly activeTripsQuery = { status: 'preparing,in_transit,delayed' };

  // ------------------------------------------------------------ data

  private readonly source = computed<DashboardSource>(() => ({
    vehicles: this.directory.vehicles(),
    drivers: this.directory.drivers(),
    trips: this.directory.trips(),
    fuel: this.directory.fuel(),
    expenses: this.directory.expenses(),
    maintenance: this.directory.maintenance(),
    documents: this.directory.documents(),
    profitability: this.analytics.tripProfitability(),
    fuelAnalysis: this.analytics.fuelAnalysis(),
    reporting: this.currency.reporting(),
    today: this.today,
    expiryWarningDays: this.settings.expiryWarningDays(),
  }));

  private readonly comparisonRange = computed(() => previousPeriod(this.period()));
  protected readonly metrics = computed(() => periodMetrics(this.source(), this.period()));
  private readonly previousMetrics = computed(() => {
    const range = this.comparisonRange();
    return range ? periodMetrics(this.source(), range) : null;
  });
  protected readonly fleet = computed(() => fleetSnapshot(this.directory.vehicles()));

  protected readonly activeTrips = computed(() => activeTrips(this.directory.trips()));
  protected readonly recentTrips = computed(() => recentTrips(this.directory.trips(), this.today, PANEL_LIMIT));
  protected readonly maintenanceQueue = computed(() => upcomingMaintenance(this.directory.maintenance(), this.today));
  protected readonly overdueCount = computed(() => this.maintenanceQueue().filter((item) => item.status === 'overdue').length);
  protected readonly expiringDocuments = computed(() =>
    expiringDocuments(this.directory.documents(), this.today, this.settings.expiryWarningDays()),
  );
  protected readonly limit = PANEL_LIMIT;

  // ------------------------------------------------------------ header

  protected readonly subtitle = computed(() => {
    const user = this.directory.user(this.users.currentUserId());
    const firstName = user?.fullName.split(' ')[0];
    const hour = Number(this.clock.now().slice(11, 13));
    const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const greeting = firstName ? this.i18n.t(`dashboard.greeting.${part}`, { name: firstName }) : this.i18n.t('dashboard.greeting.anonymous');
    return this.i18n.t('dashboard.subtitle', {
      greeting,
      organization: this.settings.organization()?.displayName ?? this.i18n.t('common.appName'),
      date: this.format.date(this.today, 'long'),
    });
  });

  protected readonly comparisonLabel = computed(() => {
    const range = this.comparisonRange();
    if (!range) return this.i18n.t('dashboard.noComparison');
    return `${this.i18n.t('dashboard.vsPrevious')}: ${this.format.date(range.from, 'medium')} – ${this.format.date(range.to, 'medium')}`;
  });

  // ------------------------------------------------------------ KPIs

  protected readonly kpis = computed<KpiView[]>(() => {
    const t = (key: string, params?: Record<string, string | number>) => this.i18n.t(key, params);
    const fleet = this.fleet();
    const current = this.metrics();
    const previous = this.previousMetrics();
    const active = this.activeTrips();
    const delayed = active.filter((trip) => trip.status === 'delayed').length;
    const money = (value: number) => this.format.reporting(value, { wholeUnits: true });

    const marginPoints =
      previous && current.marginRatio !== null && previous.marginRatio !== null ? (current.marginRatio - previous.marginRatio) * 100 : null;

    const items: KpiView[] = [
      {
        key: 'fleet',
        label: t('dashboard.kpis.fleet'),
        value: this.format.number(fleet.total),
        icon: 'truck',
        hint: t('dashboard.kpis.fleetHint', { available: fleet.available, inactive: fleet.inactive }),
        delta: null,
        deltaTone: 'neutral',
        link: '/vehicles',
        queryParams: null,
      },
      {
        key: 'operational',
        label: t('dashboard.kpis.operational'),
        value: this.format.number(fleet.operational),
        icon: 'circle-check',
        hint: t('dashboard.kpis.operationalHint', { share: this.format.percent(fleet.operationalRatio, 0) }),
        delta: null,
        deltaTone: 'neutral',
        link: '/vehicles',
        queryParams: null,
      },
      {
        key: 'maintenance',
        label: t('dashboard.kpis.maintenance'),
        value: this.format.number(fleet.maintenance),
        icon: 'wrench',
        hint: this.overdueCount() ? t('dashboard.kpis.maintenanceHint', { count: this.overdueCount() }) : t('dashboard.kpis.maintenanceHintNone'),
        delta: null,
        deltaTone: 'neutral',
        link: '/vehicles',
        queryParams: { status: 'maintenance' },
      },
      {
        key: 'tripsActive',
        label: t('dashboard.kpis.tripsActive'),
        value: this.format.number(active.length),
        icon: 'route',
        hint: delayed ? t('dashboard.kpis.tripsActiveHint', { count: delayed }) : null,
        delta: null,
        deltaTone: 'neutral',
        link: '/trips',
        queryParams: this.activeTripsQuery,
      },
      {
        key: 'tripsFinished',
        label: t('dashboard.kpis.tripsFinished'),
        value: this.format.number(current.finishedTrips),
        icon: 'flag',
        hint: t('dashboard.kpis.tripsFinishedHint'),
        ...this.delta(current.finishedTrips, previous?.finishedTrips, true),
        link: '/trips',
        queryParams: { status: 'delivered,completed' },
      },
      {
        key: 'revenue',
        label: t('dashboard.kpis.revenue'),
        value: money(current.revenue),
        icon: 'banknote',
        hint: t('dashboard.kpis.revenueHint'),
        ...this.delta(current.revenue, previous?.revenue, true),
        link: '/profitability',
        queryParams: { groupBy: 'trip' },
      },
      {
        key: 'expenses',
        label: t('dashboard.kpis.expenses'),
        value: money(current.operatingExpenses),
        icon: 'wallet',
        hint: t('dashboard.kpis.expensesHint'),
        // Higher costs are not "good" or "bad" on their own (more trips cost more): no tone.
        ...this.delta(current.operatingExpenses, previous?.operatingExpenses, false),
        link: '/expenses',
        queryParams: null,
      },
      {
        key: 'margin',
        label: t('dashboard.kpis.margin'),
        value: money(current.contributionMargin),
        icon: 'percent',
        hint:
          current.marginRatio === null
            ? t('dashboard.kpis.marginHintNoRevenue')
            : t('dashboard.kpis.marginHint', { ratio: this.format.percent(current.marginRatio, 1) }),
        delta: marginPoints === null ? null : t('dashboard.kpis.deltaPoints', { value: this.signed(this.format.number(marginPoints, 1), marginPoints) }),
        deltaTone: this.tone(marginPoints ?? 0, true),
        link: '/profitability',
        queryParams: null,
      },
    ];
    return items;
  });

  // ------------------------------------------------------------ charts

  private readonly chartEnd = computed(() => this.period().to ?? this.today);
  private readonly months = computed(() => trailingMonths(this.chartEnd(), TREND_MONTHS));
  private readonly trend = computed(() => monthlyTrend(this.source(), this.months()));

  protected readonly chartCategories = computed(() => this.months().map((month) => this.format.date(`${month}-01`, 'month')));
  protected readonly chartEndLabel = computed(() => this.format.date(`${this.chartEnd().slice(0, 7)}-01`, 'monthYear'));

  protected readonly revenueSeries = computed<ChartSeries[]>(() => [
    { key: 'revenue', label: this.i18n.t('dashboard.charts.revenueSeries'), values: this.trend().map((p) => p.revenue), color: 1 },
    { key: 'costs', label: this.i18n.t('dashboard.charts.costsSeries'), values: this.trend().map((p) => p.directCosts), color: 2 },
  ]);
  protected readonly fuelSeries = computed<ChartSeries[]>(() => [
    { key: 'litres', label: this.i18n.t('dashboard.charts.fuelSeries'), values: this.trend().map((p) => p.fuelLitres), color: 3 },
  ]);
  protected readonly maintenanceSeries = computed<ChartSeries[]>(() => [
    { key: 'maintenance', label: this.i18n.t('dashboard.charts.maintenanceSeries'), values: this.trend().map((p) => p.maintenanceCost), color: 4 },
  ]);

  protected readonly hasRevenueData = computed(() => this.trend().some((p) => p.revenue > 0 || p.directCosts > 0));
  protected readonly hasFuelData = computed(() => this.trend().some((p) => p.fuelLitres > 0));
  protected readonly hasMaintenanceData = computed(() => this.trend().some((p) => p.maintenanceCost > 0));

  protected readonly costSlices = computed<DonutSlice[]>(() => {
    const breakdown = this.metrics().costBreakdown;
    const colors = { fuel: 3, tolls_fees: 5, driver_allowance: 6, maintenance: 4, other: 2 } as const;
    return OPERATING_COST_BUCKETS.map((bucket) => ({
      key: bucket,
      label: this.i18n.t(`dashboard.buckets.${bucket}`),
      value: breakdown[bucket],
      color: colors[bucket],
    }));
  });

  protected readonly fuelPeriodLabel = computed(() =>
    this.i18n.t('dashboard.charts.fuelPeriod', {
      litres: this.format.volume(this.metrics().fuelLitres, 0),
      cost: this.format.reporting(this.metrics().fuelCost, { wholeUnits: true }),
    }),
  );
  protected readonly maintenancePeriodLabel = computed(() =>
    this.i18n.t('dashboard.charts.maintenancePeriod', { cost: this.format.reporting(this.metrics().maintenanceCost, { wholeUnits: true }) }),
  );

  protected readonly moneyFormat: ValueFormatter = (value) => this.format.reporting(value, { wholeUnits: true });
  protected readonly moneyAxisFormat: ValueFormatter = (value) => this.format.reporting(value, { compact: true });
  protected readonly litresFormat: ValueFormatter = (value) => this.format.volume(value, 0);
  protected readonly compactFormat: ValueFormatter = (value) => this.format.compact(value);
  protected readonly percentFormat: ValueFormatter = (ratio) => this.format.percent(ratio, 0);

  // ------------------------------------------------------------ alerts

  protected readonly alerts = computed<AlertView[]>(() =>
    buildAlerts(this.source(), {
      fuelWarnings: this.metrics().fuelWarnings,
      routeLabel: (trip) => this.directory.routeLabel(trip),
      driverName: (driver) => `${driver.firstName} ${driver.lastName}`,
    }).map((alert) => {
      const params = { ...alert.params };
      if (alert.kind === 'trip_delayed' && !params['reason']) params['reason'] = this.i18n.t('dashboard.panels.noDelayReason');
      return {
        id: alert.id,
        severity: alert.severity,
        icon: ALERT_ICONS[alert.kind],
        title: this.i18n.t(`dashboard.alerts.${alert.kind}.title`, params),
        description: this.i18n.t(`dashboard.alerts.${alert.kind}.description`, params),
        link: alert.link,
        queryParams: alert.queryParams ?? null,
      };
    }),
  );

  // ------------------------------------------------------------ helpers

  protected dueLabel(days: number): string {
    if (days === 0) return this.i18n.t('dashboard.panels.dueToday');
    return days > 0 ? this.i18n.t('dashboard.panels.dueIn', { count: days }) : this.i18n.t('dashboard.panels.overdueBy', { count: -days });
  }

  private delta(current: number, previous: number | null | undefined, toned: boolean): { delta: string | null; deltaTone: DeltaTone } {
    const change = percentChange(current, previous);
    if (change === null) return { delta: null, deltaTone: 'neutral' };
    return { delta: this.signed(this.format.percent(change, 1), change), deltaTone: toned ? this.tone(change, true) : 'neutral' };
  }

  private signed(text: string, value: number): string {
    return value > 0 ? `+${text}` : text;
  }

  private tone(value: number, higherIsBetter: boolean): DeltaTone {
    if (Math.abs(value) < 0.0005) return 'neutral';
    return value > 0 === higherIsBetter ? 'positive' : 'negative';
  }
}
