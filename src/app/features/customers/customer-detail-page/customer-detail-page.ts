import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CURRENCIES } from '../../../core/formatting/currency';
import { monthsInRange } from '../../../core/formatting/date-utils';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Customer, CustomerStatus, FINISHED_TRIP_STATUSES } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FleetAnalytics } from '../../../core/services/fleet-analytics.service';
import { BarChart } from '../../../shared/ui/charts/bar-chart/bar-chart';
import { ChartSeries } from '../../../shared/ui/charts/chart.model';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ExpiryBadge } from '../../../shared/ui/expiry-badge/expiry-badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiCard } from '../../../shared/ui/kpi-card/kpi-card';
import { Modal } from '../../../shared/ui/modal/modal';
import { Money } from '../../../shared/ui/money/money';
import { Breadcrumb, PageHeader } from '../../../shared/ui/page-header/page-header';
import { SimulatedNotice } from '../../../shared/ui/simulated-notice/simulated-notice';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TooltipDirective } from '../../../shared/ui/tooltip/tooltip.directive';
import { resolvePeriod } from '../../../shared/utils/period';
import { CustomerForm } from '../customer-form/customer-form';
import { CustomersFacade, creditUsage, tripReportingDate } from '../customers.facade';

export type CustomerTab = 'overview' | 'trips' | 'revenue' | 'documents';
const TABS: CustomerTab[] = ['overview', 'trips', 'revenue', 'documents'];
const TOP_ROUTES = 5;

@Component({
  selector: 'app-customer-detail-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    StatusBadge,
    ExpiryBadge,
    EmptyState,
    Icon,
    KpiCard,
    Money,
    Modal,
    SimulatedNotice,
    TooltipDirective,
    BarChart,
    CustomerForm,
  ],
  templateUrl: './customer-detail-page.html',
  styleUrl: './customer-detail-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDetailPage {
  /** Route param and query param, bound by the router. */
  readonly id = input.required<string>();
  readonly tab = input<string | undefined>();

  protected readonly directory = inject(EntityDirectory);
  private readonly analytics = inject(FleetAnalytics);
  private readonly facade = inject(CustomersFacade);
  private readonly format = inject(FormatService);
  private readonly clock = inject(ClockService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslationService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly tabs = TABS;
  protected readonly activeTab = linkedSignal<CustomerTab>(() => (TABS.includes(this.tab() as CustomerTab) ? (this.tab() as CustomerTab) : 'overview'));
  protected readonly editOpen = signal(false);
  protected readonly statusSaving = signal(false);

  protected readonly customer = computed(() => this.directory.customer(this.id()));

  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => [
    { label: 'customers.detail.backToList', link: '/customers', translate: true },
    { label: this.customer()?.name ?? '…' },
  ]);

  protected readonly trips = computed(() =>
    this.facade.tripsOf(this.id()).map((trip) => ({ trip, profitability: this.analytics.profitabilityOf(trip.id) })),
  );

  protected readonly metrics = computed(() => this.facade.metricsOf(this.id()));

  protected readonly credit = computed(() => {
    const customer = this.customer();
    if (!customer) return null;
    const usage = creditUsage(customer);
    return { ...usage, percent: usage.ratio === null ? 0 : Math.min(100, Math.round(usage.ratio * 100)) };
  });

  protected readonly documents = computed(() =>
    this.directory
      .documents()
      .filter((document) => document.entityType === 'customer' && document.entityId === this.id())
      .sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999')),
  );

  /** Monthly revenue of finished trips over the last 6 months, in the reporting currency. */
  protected readonly monthly = computed(() => {
    const today = this.clock.today();
    const months = monthsInRange(resolvePeriod('last6Months', today).from ?? today, today);
    const totals = new Map(months.map((month) => [month, 0]));
    for (const { trip, profitability } of this.trips()) {
      if (!FINISHED_TRIP_STATUSES.includes(trip.status)) continue;
      const month = tripReportingDate(trip).slice(0, 7);
      if (totals.has(month)) totals.set(month, (totals.get(month) ?? 0) + (profitability?.revenue ?? 0));
    }
    this.i18n.revision();
    const values = months.map((month) => totals.get(month) ?? 0);
    const series: ChartSeries[] = [{ key: 'revenue', label: this.i18n.t('customers.columns.revenue'), values, color: 1 }];
    return {
      categories: months.map((month) => this.format.date(`${month}-01`, 'month')),
      series,
      hasData: values.some((value) => value > 0),
    };
  });

  /** Routes ranked by revenue (reporting currency), excluding cancelled trips. */
  protected readonly topRoutes = computed(() => {
    const groups = new Map<string, { label: string; trips: number; revenue: number }>();
    for (const { trip, profitability } of this.trips()) {
      if (trip.status === 'cancelled') continue;
      const label = this.directory.routeLabel(trip);
      const group = groups.get(label) ?? { label, trips: 0, revenue: 0 };
      group.trips++;
      group.revenue += profitability?.revenue ?? 0;
      groups.set(label, group);
    }
    const ranked = [...groups.values()].sort((a, b) => b.revenue - a.revenue).slice(0, TOP_ROUTES);
    const max = ranked[0]?.revenue ?? 0;
    return ranked.map((route) => ({ ...route, share: max > 0 ? Math.round((route.revenue / max) * 100) : 0 }));
  });

  protected readonly formatReporting = (value: number): string => this.format.reporting(value, { wholeUnits: true });
  protected readonly formatAxis = (value: number): string => this.format.reporting(value, { compact: true });

  protected selectTab(tab: CustomerTab): void {
    this.activeTab.set(tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    this.selectTab(next);
    queueMicrotask(() => document.getElementById(`customer-tab-${next}`)?.focus());
  }

  protected onSaved(customer: Customer): void {
    this.editOpen.set(false);
    this.toast.success(this.i18n.t('customers.toasts.updated', { name: customer.name }));
  }

  protected async toggleStatus(customer: Customer): Promise<void> {
    const next: CustomerStatus = customer.status === 'active' ? 'inactive' : 'active';
    if (next === 'inactive') {
      const confirmed = await this.confirm.ask({
        title: this.i18n.t('customers.confirmDeactivate.title', { name: customer.name }),
        message: this.i18n.t('customers.confirmDeactivate.message'),
        confirmLabel: this.i18n.t('customers.deactivate'),
        tone: 'primary',
      });
      if (!confirmed) return;
    }
    this.statusSaving.set(true);
    try {
      await this.facade.setStatus(customer.id, next);
      this.toast.success(this.i18n.t(next === 'active' ? 'customers.toasts.activated' : 'customers.toasts.deactivated', { name: customer.name }));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.statusSaving.set(false);
    }
  }

  protected countryLabel(code: string): string {
    const key = `countries.${code}`;
    return this.i18n.has(key) ? this.i18n.t(key) : code;
  }

  protected creditLimitText(customer: Customer): string {
    return this.format.money(customer.creditLimit, { wholeUnits: true });
  }

  protected currencyName(customer: Customer): string {
    return this.i18n.t(CURRENCIES[customer.preferredCurrency].nameKey);
  }
}
