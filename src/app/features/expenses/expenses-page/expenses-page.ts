import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { ExpenseQuery, ExpenseRepository } from '../../../core/data-access/repositories';
import { CurrencyService } from '../../../core/formatting/currency.service';
import { isWithinRange } from '../../../core/formatting/date-utils';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import {
  APPROVAL_STATUSES,
  ApprovalStatus,
  CURRENCY_CODES,
  CurrencyCode,
  EXPENSE_CATEGORIES,
  Expense,
  ExpenseCategory,
} from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { DonutChart } from '../../../shared/ui/charts/donut-chart/donut-chart';
import { DonutSlice } from '../../../shared/ui/charts/chart.model';
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
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TooltipDirective } from '../../../shared/ui/tooltip/tooltip.directive';
import { downloadCsv } from '../../../shared/utils/csv';
import { createListState } from '../../../shared/utils/list-state';
import { PeriodSelection, resolvePeriod } from '../../../shared/utils/period';
import { approvalCounts, categoryBreakdown, summariseExpenses } from '../expense-calculations';
import { ExpenseForm, ExpenseFormDefaults, ExpenseSaveResult } from '../expense-form/expense-form';
import { ExpensesFacade } from '../expenses.facade';

/** Fixed chart colour slot per category (tied to the category, never to its rank). */
const CATEGORY_COLORS: Partial<Record<ExpenseCategory, DonutSlice['color']>> = {
  tolls: 1,
  border_fees: 2,
  driver_allowance: 3,
  repairs: 4,
  fines: 5,
};
const OTHERS_COLOR: DonutSlice['color'] = 6;

@Component({
  selector: 'app-expenses-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    PeriodFilter,
    KpiCard,
    SimulatedNotice,
    DonutChart,
    StatusBadge,
    EmptyState,
    Icon,
    Money,
    Pagination,
    TableSkeleton,
    Dropdown,
    DropdownTrigger,
    Modal,
    TooltipDirective,
    ExpenseForm,
  ],
  templateUrl: './expenses-page.html',
  styleUrl: './expenses-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpensesPage {
  private readonly repository = inject(ExpenseRepository);
  private readonly facade = inject(ExpensesFacade);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly clock = inject(ClockService);
  protected readonly currency = inject(CurrencyService);
  protected readonly directory = inject(EntityDirectory);

  /** Query params bound by the router (deep links from dashboard, trips, notifications). */
  readonly category = input<string | undefined>();
  readonly approval = input<string | undefined>();
  readonly currencyCode = input<string | undefined>(undefined, { alias: 'currency' });
  readonly vehicleId = input<string | undefined>();
  readonly tripId = input<string | undefined>();

  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly approvalStatuses = APPROVAL_STATUSES;
  protected readonly currencies = CURRENCY_CODES;
  protected readonly list = createListState({ pageSize: 10, sort: { field: 'date', direction: 'desc' } });
  protected readonly categoryFilter = linkedSignal<ExpenseCategory | null>(() => this.asCategory(this.category()));
  protected readonly approvalFilter = linkedSignal<ApprovalStatus | null>(() => this.asApproval(this.approval()));
  protected readonly currencyFilter = linkedSignal<CurrencyCode | null>(() => this.asCurrency(this.currencyCode()));
  protected readonly vehicleFilter = linkedSignal<string | null>(() => this.vehicleId() || null);
  protected readonly tripFilter = linkedSignal<string | null>(() => this.tripId() || null);
  /** A trip context shows the whole trip, whatever its dates. */
  protected readonly period = linkedSignal<PeriodSelection>(() =>
    resolvePeriod(this.tripId() ? 'allTime' : 'last90Days', this.clock.today()),
  );

  protected readonly selection = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Expense | null>(null);
  protected readonly formDefaults = signal<ExpenseFormDefaults | null>(null);

  protected readonly query = createQuery(
    () => ({ ...this.filters(), page: this.list.page(), pageSize: this.list.pageSize(), version: this.repository.changes() }),
    (params) => this.repository.list(params),
  );

  protected readonly hasFilters = computed(
    () =>
      !!this.categoryFilter() ||
      !!this.approvalFilter() ||
      !!this.currencyFilter() ||
      !!this.vehicleFilter() ||
      !!this.tripFilter() ||
      this.list.hasSearch(),
  );

  protected readonly contextTrip = computed(() => this.directory.trip(this.tripFilter()));

  /** Expenses behind the summary and tab counts: everything except approval state and search. */
  private readonly scoped = computed(() => {
    const { from, to } = this.period();
    const category = this.categoryFilter();
    const currency = this.currencyFilter();
    const vehicleId = this.vehicleFilter();
    const tripId = this.tripFilter();
    return this.directory
      .expenses()
      .filter(
        (expense) =>
          (!category || expense.category === category) &&
          (!currency || expense.amount.currency === currency) &&
          (!vehicleId || expense.vehicleId === vehicleId) &&
          (!tripId || expense.tripId === tripId) &&
          isWithinRange(expense.date, from, to),
      );
  });

  protected readonly summary = computed(() => summariseExpenses(this.scoped(), this.currency.reporting()));
  protected readonly counts = computed(() => approvalCounts(this.scoped()));

  protected readonly donut = computed(() => {
    const breakdown = categoryBreakdown(this.scoped(), this.currency.reporting());
    const slices: DonutSlice[] = [];
    const grouped: ExpenseCategory[] = [];
    let othersTotal = 0;
    for (const entry of breakdown) {
      const color = CATEGORY_COLORS[entry.category];
      if (color) {
        slices.push({ key: entry.category, label: this.i18n.t(`expenses.categories.${entry.category}`), value: entry.total, color });
      } else {
        grouped.push(entry.category);
        othersTotal += entry.total;
      }
    }
    if (othersTotal > 0) {
      slices.push({ key: 'others', label: this.i18n.t('expenses.breakdown.others'), value: othersTotal, color: OTHERS_COLOR });
    }
    const total = breakdown.reduce((sum, entry) => sum + entry.total, 0);
    return {
      slices,
      total,
      othersHint: grouped.length
        ? this.i18n.t('expenses.breakdown.othersHint', {
            categories: grouped.map((category) => this.i18n.t(`expenses.categories.${category}`)).join(', '),
          })
        : null,
    };
  });

  protected readonly formatDonutValue = (value: number): string => this.format.reporting(value, { wholeUnits: true });
  protected readonly formatPercent = (ratio: number): string => this.format.percent(ratio, 0);

  protected readonly vehicleOptions = computed(() =>
    [...this.directory.vehicles()].sort((a, b) => a.plateNumber.localeCompare(b.plateNumber)),
  );

  /** Pending rows on the current page, and the ones currently ticked. */
  protected readonly pendingOnPage = computed(() =>
    (this.query.value()?.items ?? []).filter((expense) => expense.approvalStatus === 'pending').map((expense) => expense.id),
  );
  protected readonly selectedIds = computed(() => this.pendingOnPage().filter((id) => this.selection().has(id)));
  protected readonly allSelected = computed(() => this.pendingOnPage().length > 0 && this.selectedIds().length === this.pendingOnPage().length);
  protected readonly someSelected = computed(() => this.selectedIds().length > 0 && !this.allSelected());

  protected kpiParams(approval: ApprovalStatus | null): Record<string, string> {
    const params: Record<string, string> = {};
    const category = this.categoryFilter();
    const currency = this.currencyFilter();
    const vehicleId = this.vehicleFilter();
    const tripId = this.tripFilter();
    if (approval) params['approval'] = approval;
    if (category) params['category'] = category;
    if (currency) params['currency'] = currency;
    if (vehicleId) params['vehicleId'] = vehicleId;
    if (tripId) params['tripId'] = tripId;
    return params;
  }

  protected setApprovalFilter(status: ApprovalStatus | null): void {
    this.approvalFilter.set(status);
    this.applyFilters();
  }

  protected setCategory(event: Event): void {
    this.categoryFilter.set(this.asCategory((event.target as HTMLSelectElement).value));
    this.applyFilters();
  }

  protected setCurrency(event: Event): void {
    this.currencyFilter.set(this.asCurrency((event.target as HTMLSelectElement).value));
    this.applyFilters();
  }

  protected setVehicle(event: Event): void {
    this.vehicleFilter.set((event.target as HTMLSelectElement).value || null);
    const trip = this.contextTrip();
    if (trip && this.vehicleFilter() && trip.vehicleId !== this.vehicleFilter()) this.tripFilter.set(null);
    this.applyFilters();
  }

  protected clearTrip(): void {
    this.tripFilter.set(null);
    this.applyFilters();
  }

  protected setPeriod(period: PeriodSelection): void {
    this.period.set(period);
    this.list.resetPage();
  }

  protected clearFilters(): void {
    this.categoryFilter.set(null);
    this.approvalFilter.set(null);
    this.currencyFilter.set(null);
    this.vehicleFilter.set(null);
    this.tripFilter.set(null);
    this.list.clearSearch();
    this.syncUrl();
  }

  protected toggleRow(id: string): void {
    const next = new Set(this.selection());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selection.set(next);
  }

  protected toggleAll(): void {
    this.selection.set(this.allSelected() ? new Set() : new Set(this.pendingOnPage()));
  }

  protected clearSelection(): void {
    this.selection.set(new Set());
  }

  protected async approveSelected(): Promise<void> {
    const ids = this.selectedIds();
    if (!ids.length) return;
    this.busy.set(true);
    try {
      const count = await this.facade.approveMany(ids);
      this.toast.success(this.i18n.t('expenses.toasts.bulkApproved', { count }));
      this.clearSelection();
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async approve(expense: Expense): Promise<void> {
    await this.changeApproval(expense, 'approved', 'expenses.toasts.approved');
  }

  protected async reject(expense: Expense): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('expenses.confirmReject.title', { reference: expense.reference }),
      message: this.i18n.t('expenses.confirmReject.message'),
      confirmLabel: this.i18n.t('common.actions.reject'),
      tone: 'danger',
    });
    if (!confirmed) return;
    await this.changeApproval(expense, 'rejected', 'expenses.toasts.rejected');
  }

  protected async resetPending(expense: Expense): Promise<void> {
    await this.changeApproval(expense, 'pending', 'expenses.toasts.pending');
  }

  protected openCreate(): void {
    const trip = this.contextTrip();
    this.editing.set(null);
    this.formDefaults.set({
      tripId: trip?.id ?? null,
      vehicleId: trip?.vehicleId ?? this.vehicleFilter(),
      driverId: trip?.driverId ?? null,
      category: this.categoryFilter(),
    });
    this.formOpen.set(true);
  }

  protected openEdit(expense: Expense): void {
    this.editing.set(expense);
    this.formDefaults.set(null);
    this.formOpen.set(true);
  }

  protected onSaved(result: ExpenseSaveResult): void {
    this.formOpen.set(false);
    this.toast.success(
      this.i18n.t(result.created ? 'expenses.toasts.created' : 'expenses.toasts.updated', { reference: result.expense.reference }),
    );
  }

  protected async remove(expense: Expense): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('expenses.confirmDelete.title', { reference: expense.reference }),
      message: this.i18n.t('expenses.confirmDelete.message'),
      confirmLabel: this.i18n.t('common.actions.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await this.facade.delete(expense.id);
      this.toast.success(this.i18n.t('expenses.toasts.deleted', { reference: expense.reference }));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  protected async exportCsv(): Promise<void> {
    const result = await this.repository.list(this.filters());
    const t = (key: string) => this.i18n.t(key);
    downloadCsv(
      `${t('expenses.csv.fileName')}-${this.clock.today()}`,
      [
        t('expenses.fields.reference'),
        t('expenses.fields.date'),
        t('expenses.fields.category'),
        t('expenses.fields.description'),
        t('expenses.fields.vendor'),
        t('expenses.fields.vehicle'),
        t('expenses.fields.trip'),
        t('expenses.fields.driver'),
        t('expenses.fields.amount'),
        t('expenses.fields.currency'),
        t('expenses.fields.paymentMethod'),
        t('expenses.fields.approvalStatus'),
        t('expenses.fields.submittedBy'),
        t('expenses.fields.receipt'),
      ],
      result.items.map((e) => [
        e.reference,
        e.date,
        t(`expenses.categories.${e.category}`),
        e.description,
        e.vendor,
        e.vehicleId ? this.directory.plate(e.vehicleId) : '',
        e.tripId ? this.directory.tripReference(e.tripId) : '',
        e.driverId ? this.directory.driverName(e.driverId) : '',
        e.amount.amount,
        e.amount.currency,
        t(`expenses.paymentMethods.${e.paymentMethod}`),
        t(`expenses.approval.${e.approvalStatus}`),
        this.directory.user(e.submittedByUserId)?.fullName ?? '',
        e.receiptFileName ?? '',
      ]),
    );
    this.toast.success(t('common.toasts.exported'));
  }

  private filters(): ExpenseQuery {
    return {
      search: this.list.search(),
      category: this.categoryFilter(),
      approvalStatus: this.approvalFilter(),
      currency: this.currencyFilter(),
      vehicleId: this.vehicleFilter(),
      tripId: this.tripFilter(),
      from: this.period().from,
      to: this.period().to,
      sort: this.list.sort(),
    };
  }

  private async changeApproval(expense: Expense, status: ApprovalStatus, toastKey: string): Promise<void> {
    try {
      await this.facade.setApproval(expense.id, status);
      if (status !== 'pending') {
        const next = new Set(this.selection());
        next.delete(expense.id);
        this.selection.set(next);
      }
      const message = this.i18n.t(toastKey, { reference: expense.reference });
      if (status === 'rejected') this.toast.info(message);
      else this.toast.success(message);
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  private applyFilters(): void {
    this.list.resetPage();
    this.syncUrl();
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      queryParams: {
        approval: this.approvalFilter(),
        category: this.categoryFilter(),
        currency: this.currencyFilter(),
        vehicleId: this.vehicleFilter(),
        tripId: this.tripFilter(),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private asCategory(value: string | null | undefined): ExpenseCategory | null {
    return EXPENSE_CATEGORIES.includes(value as ExpenseCategory) ? (value as ExpenseCategory) : null;
  }

  private asApproval(value: string | null | undefined): ApprovalStatus | null {
    return APPROVAL_STATUSES.includes(value as ApprovalStatus) ? (value as ApprovalStatus) : null;
  }

  private asCurrency(value: string | null | undefined): CurrencyCode | null {
    return CURRENCY_CODES.includes(value as CurrencyCode) ? (value as CurrencyCode) : null;
  }
}
