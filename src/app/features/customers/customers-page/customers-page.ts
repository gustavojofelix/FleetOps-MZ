import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { paginate, sortItems } from '../../../core/data-access/query-utils';
import { CustomerRepository } from '../../../core/data-access/repositories';
import { CurrencyService } from '../../../core/formatting/currency.service';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { CUSTOMER_SEGMENTS, CUSTOMER_STATUSES, Customer, CustomerSegment, CustomerStatus } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { Dropdown, DropdownTrigger } from '../../../shared/ui/dropdown/dropdown';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { PeriodFilter } from '../../../shared/ui/period-filter/period-filter';
import { SimulatedNotice } from '../../../shared/ui/simulated-notice/simulated-notice';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TooltipDirective } from '../../../shared/ui/tooltip/tooltip.directive';
import { downloadCsv } from '../../../shared/utils/csv';
import { createListState } from '../../../shared/utils/list-state';
import { PeriodSelection, resolvePeriod } from '../../../shared/utils/period';
import { CustomerForm } from '../customer-form/customer-form';
import { CustomerMetrics, CustomersFacade } from '../customers.facade';
import { CUSTOMER_COUNTRIES } from '../customer-countries';

interface CustomerRow {
  customer: Customer;
  metrics: CustomerMetrics;
}

const EMPTY_METRICS: CustomerMetrics = {
  tripsTotal: 0,
  tripsActive: 0,
  tripsInPeriod: 0,
  revenueTotal: 0,
  revenueInPeriod: 0,
  finishedTrips: 0,
  averageMarginRatio: null,
};

/** Sort fields computed from trips rather than stored on the customer. */
const METRIC_FIELDS = new Set(['tripsInPeriod', 'tripsTotal', 'revenueInPeriod', 'revenueTotal']);

@Component({
  selector: 'app-customers-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    StatusBadge,
    EmptyState,
    Icon,
    Pagination,
    PeriodFilter,
    SimulatedNotice,
    TableSkeleton,
    TooltipDirective,
    Dropdown,
    DropdownTrigger,
    Modal,
    CustomerForm,
  ],
  templateUrl: './customers-page.html',
  styleUrl: './customers-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersPage {
  private readonly repository = inject(CustomerRepository);
  private readonly facade = inject(CustomersFacade);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly currency = inject(CurrencyService);
  private readonly clock = inject(ClockService);
  protected readonly directory = inject(EntityDirectory);

  /** Query params (bound by the router) so dashboard links can pre-filter the list. */
  readonly status = input<string | undefined>();
  readonly segment = input<string | undefined>();
  readonly country = input<string | undefined>();

  protected readonly statuses = CUSTOMER_STATUSES;
  protected readonly segments = CUSTOMER_SEGMENTS;
  protected readonly countries = CUSTOMER_COUNTRIES;
  protected readonly list = createListState({ pageSize: 10, sort: { field: 'name', direction: 'asc' } });
  protected readonly statusFilter = linkedSignal<CustomerStatus | null>(() => this.asStatus(this.status()));
  protected readonly segmentFilter = linkedSignal<CustomerSegment | null>(() => this.asSegment(this.segment()));
  protected readonly countryFilter = linkedSignal<string | null>(() => this.asCountry(this.country()));
  protected readonly period = signal<PeriodSelection>(resolvePeriod('last90Days', this.clock.today()));

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Customer | null>(null);

  /** Filtered (unpaged) customers; sorting and paging happen locally because some columns are derived. */
  protected readonly query = createQuery(
    () => ({
      search: this.list.search(),
      status: this.statusFilter(),
      segment: this.segmentFilter(),
      country: this.countryFilter(),
      version: this.repository.changes(),
    }),
    (params) => this.repository.list(params),
  );

  private readonly metrics = computed(() => this.facade.metricsFor(this.period().from, this.period().to));

  protected readonly rows = computed<CustomerRow[]>(() => {
    const result = this.query.value();
    if (!result) return [];
    const metrics = this.metrics();
    return result.items.map((customer) => ({ customer, metrics: metrics.get(customer.id) ?? EMPTY_METRICS }));
  });

  protected readonly page = computed(() => {
    const sorted = sortItems(this.rows(), this.list.sort(), (row, field) => this.sortValue(row, field));
    return paginate(sorted, { page: this.list.page(), pageSize: this.list.pageSize() });
  });

  protected readonly counts = computed(() => {
    const all = this.directory.customers();
    const byStatus = new Map<CustomerStatus, number>();
    all.forEach((c) => byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1));
    return { total: all.length, byStatus };
  });

  protected readonly hasFilters = computed(
    () => !!this.statusFilter() || !!this.segmentFilter() || !!this.countryFilter() || this.list.hasSearch(),
  );

  protected readonly subtitle = computed(() => {
    const counts = this.counts();
    return this.i18n.t('customers.subtitle', {
      total: this.format.number(counts.total),
      active: this.format.number(counts.byStatus.get('active') ?? 0),
    });
  });

  protected setStatus(status: CustomerStatus | null): void {
    this.statusFilter.set(status);
    this.list.resetPage();
    this.syncUrl();
  }

  protected setSegment(event: Event): void {
    this.segmentFilter.set(this.asSegment((event.target as HTMLSelectElement).value));
    this.list.resetPage();
    this.syncUrl();
  }

  protected setCountry(event: Event): void {
    this.countryFilter.set(this.asCountry((event.target as HTMLSelectElement).value));
    this.list.resetPage();
    this.syncUrl();
  }

  protected clearFilters(): void {
    this.statusFilter.set(null);
    this.segmentFilter.set(null);
    this.countryFilter.set(null);
    this.list.clearSearch();
    this.syncUrl();
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(customer: Customer): void {
    this.editing.set(customer);
    this.formOpen.set(true);
  }

  protected onSaved(customer: Customer, created: boolean): void {
    this.formOpen.set(false);
    this.toast.success(this.i18n.t(created ? 'customers.toasts.created' : 'customers.toasts.updated', { name: customer.name }));
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
    try {
      await this.facade.setStatus(customer.id, next);
      this.toast.success(this.i18n.t(next === 'active' ? 'customers.toasts.activated' : 'customers.toasts.deactivated', { name: customer.name }));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  protected async remove(customer: Customer): Promise<void> {
    try {
      const linked = await this.facade.linkedTripCount(customer.id);
      if (linked > 0) {
        this.toast.warning(this.i18n.t('customers.toasts.cannotDelete', { count: linked }));
        return;
      }
      const confirmed = await this.confirm.ask({
        title: this.i18n.t('customers.confirmDelete.title', { name: customer.name }),
        message: this.i18n.t('customers.confirmDelete.message'),
        confirmLabel: this.i18n.t('common.actions.delete'),
      });
      if (!confirmed) return;
      await this.facade.delete(customer.id);
      this.toast.success(this.i18n.t('customers.toasts.deleted', { name: customer.name }));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  protected exportCsv(): void {
    const t = (key: string, params?: Record<string, string>) => this.i18n.t(key, params);
    const reporting = this.currency.display();
    const sorted = sortItems(this.rows(), this.list.sort(), (row, field) => this.sortValue(row, field));
    const toDisplay = (value: number) => this.currency.reportingToDisplay(value).amount;
    downloadCsv(
      `${t('customers.csv.fileName')}-${this.clock.today()}`,
      [
        t('customers.fields.code'),
        t('customers.fields.name'),
        t('customers.fields.legalName'),
        t('customers.fields.taxId'),
        t('customers.fields.segment'),
        t('customers.fields.city'),
        t('customers.fields.country'),
        t('customers.fields.contactName'),
        t('customers.fields.email'),
        t('customers.fields.phone'),
        t('customers.fields.preferredCurrency'),
        t('customers.csv.tripsPeriod'),
        t('customers.csv.tripsTotal'),
        t('customers.csv.revenuePeriod', { currency: reporting }),
        t('customers.csv.revenueTotal', { currency: reporting }),
        t('customers.csv.outstanding'),
        t('common.labels.currency'),
        t('customers.fields.status'),
      ],
      sorted.map(({ customer: c, metrics: m }) => [
        c.code,
        c.name,
        c.legalName,
        c.taxId,
        t(`customers.segments.${c.segment}`),
        c.city,
        this.countryLabel(c.country),
        c.contactName,
        c.email,
        c.phone,
        c.preferredCurrency,
        m.tripsInPeriod,
        m.tripsTotal,
        toDisplay(m.revenueInPeriod),
        toDisplay(m.revenueTotal),
        c.outstandingBalance.amount,
        c.outstandingBalance.currency,
        t(`customers.status.${c.status}`),
      ]),
    );
    this.toast.success(t('common.toasts.exported'));
  }

  protected countryLabel(code: string): string {
    const key = `countries.${code}`;
    return this.i18n.has(key) ? this.i18n.t(key) : code;
  }

  private sortValue(row: CustomerRow, field: string): unknown {
    if (METRIC_FIELDS.has(field)) return row.metrics[field as keyof CustomerMetrics];
    if (field === 'outstanding') return this.currency.toReporting(row.customer.outstandingBalance).converted.amount;
    return (row.customer as unknown as Record<string, unknown>)[field];
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      queryParams: { status: this.statusFilter(), segment: this.segmentFilter(), country: this.countryFilter() },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private asStatus(value: string | null | undefined): CustomerStatus | null {
    return CUSTOMER_STATUSES.includes(value as CustomerStatus) ? (value as CustomerStatus) : null;
  }

  private asSegment(value: string | null | undefined): CustomerSegment | null {
    return CUSTOMER_SEGMENTS.includes(value as CustomerSegment) ? (value as CustomerSegment) : null;
  }

  private asCountry(value: string | null | undefined): string | null {
    return value && CUSTOMER_COUNTRIES.includes(value) ? value : null;
  }
}
