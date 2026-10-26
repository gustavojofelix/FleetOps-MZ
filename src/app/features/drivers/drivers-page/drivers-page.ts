import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { DriverRepository } from '../../../core/data-access/repositories';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { DRIVER_STATUSES, Driver, DriverStatus } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { Dropdown, DropdownTrigger } from '../../../shared/ui/dropdown/dropdown';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ExpiryBadge } from '../../../shared/ui/expiry-badge/expiry-badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { downloadCsv } from '../../../shared/utils/csv';
import { createListState } from '../../../shared/utils/list-state';
import { DriverForm } from '../driver-form/driver-form';
import { DriverStatusDialog } from '../driver-status-dialog/driver-status-dialog';
import { DriversFacade } from '../drivers.facade';
import { driverInitials, driverName } from '../driver-utils';

@Component({
  selector: 'app-drivers-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    StatusBadge,
    ExpiryBadge,
    EmptyState,
    Icon,
    Pagination,
    TableSkeleton,
    Dropdown,
    DropdownTrigger,
    Modal,
    DriverForm,
    DriverStatusDialog,
  ],
  templateUrl: './drivers-page.html',
  styleUrl: './drivers-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriversPage {
  private readonly repository = inject(DriverRepository);
  private readonly facade = inject(DriversFacade);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly clock = inject(ClockService);
  protected readonly directory = inject(EntityDirectory);

  /** Query param (bound by the router) so dashboard links can pre-filter the list. */
  readonly status = input<string | undefined>();

  protected readonly statuses = DRIVER_STATUSES;
  protected readonly list = createListState({ pageSize: 10, sort: { field: 'name', direction: 'asc' } });
  protected readonly statusFilter = linkedSignal<DriverStatus | null>(() => this.asStatus(this.status()));

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Driver | null>(null);
  protected readonly statusTarget = signal<Driver | null>(null);

  protected readonly name = driverName;
  protected readonly initials = driverInitials;

  protected readonly query = createQuery(
    () => ({
      search: this.list.search(),
      status: this.statusFilter(),
      sort: this.list.sort(),
      page: this.list.page(),
      pageSize: this.list.pageSize(),
      version: this.repository.changes(),
    }),
    (params) => this.repository.list(params),
  );

  protected readonly counts = computed(() => {
    const all = this.directory.drivers();
    const byStatus = new Map<DriverStatus, number>();
    all.forEach((d) => byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1));
    return { total: all.length, byStatus };
  });

  protected readonly hasFilters = computed(() => !!this.statusFilter() || this.list.hasSearch());

  protected setStatus(status: DriverStatus | null): void {
    this.statusFilter.set(status);
    this.list.resetPage();
    this.syncUrl();
  }

  protected clearFilters(): void {
    this.statusFilter.set(null);
    this.list.clearSearch();
    this.syncUrl();
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(driver: Driver): void {
    this.editing.set(driver);
    this.formOpen.set(true);
  }

  protected onSaved(driver: Driver, created: boolean): void {
    this.formOpen.set(false);
    this.toast.success(this.i18n.t(created ? 'drivers.toasts.created' : 'drivers.toasts.updated', { name: driverName(driver) }));
  }

  protected async remove(driver: Driver): Promise<void> {
    const name = driverName(driver);
    try {
      const linked = await this.facade.linkedTripCount(driver.id);
      if (linked > 0) {
        this.toast.warning(this.i18n.t('drivers.toasts.cannotDelete', { count: linked }));
        return;
      }
      const confirmed = await this.confirm.ask({
        title: this.i18n.t('drivers.confirmDelete.title', { name }),
        message: this.i18n.t('drivers.confirmDelete.message'),
        confirmLabel: this.i18n.t('common.actions.delete'),
      });
      if (!confirmed) return;
      await this.facade.delete(driver);
      this.toast.success(this.i18n.t('drivers.toasts.deleted', { name }));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  protected async exportCsv(): Promise<void> {
    const result = await this.repository.list({ search: this.list.search(), status: this.statusFilter(), sort: this.list.sort() });
    const t = (key: string) => this.i18n.t(key);
    downloadCsv(
      `${t('drivers.csv.fileName')}-${this.clock.today()}`,
      [
        t('drivers.fields.employeeNumber'),
        t('drivers.fields.firstName'),
        t('drivers.fields.lastName'),
        t('drivers.fields.phone'),
        t('drivers.fields.email'),
        t('drivers.fields.city'),
        t('drivers.fields.licenceNumber'),
        t('drivers.fields.licenceCategory'),
        t('drivers.fields.licenceExpiry'),
        t('drivers.fields.crossBorder'),
        t('drivers.fields.status'),
        t('drivers.fields.assignedVehicle'),
        t('drivers.fields.hireDate'),
      ],
      result.items.map((d) => [
        d.employeeNumber,
        d.firstName,
        d.lastName,
        d.phone,
        d.email,
        d.city,
        d.licenceNumber,
        d.licenceCategory,
        d.licenceExpiry,
        t(d.crossBorderAuthorized ? 'common.labels.yes' : 'common.labels.no'),
        t(`drivers.status.${d.status}`),
        d.assignedVehicleId ? this.directory.plate(d.assignedVehicleId) : '',
        d.hireDate,
      ]),
    );
    this.toast.success(t('common.toasts.exported'));
  }

  protected subtitle(): string {
    const counts = this.counts();
    return this.i18n.t('drivers.subtitle', {
      total: this.format.number(counts.total),
      onTrip: counts.byStatus.get('on_trip') ?? 0,
      onLeave: counts.byStatus.get('on_leave') ?? 0,
    });
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      queryParams: { status: this.statusFilter() },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private asStatus(value: string | null | undefined): DriverStatus | null {
    return DRIVER_STATUSES.includes(value as DriverStatus) ? (value as DriverStatus) : null;
  }
}
