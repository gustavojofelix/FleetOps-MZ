import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { VehicleRepository } from '../../../core/data-access/repositories';
import { expiryStatus } from '../../../core/domain/document-status';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { DocumentStatus, VEHICLE_STATUSES, VEHICLE_TYPES, Vehicle, VehicleStatus, VehicleType } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { Dropdown, DropdownTrigger } from '../../../shared/ui/dropdown/dropdown';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Pagination } from '../../../shared/ui/pagination/pagination';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { TableSkeleton } from '../../../shared/ui/table-skeleton/table-skeleton';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { downloadCsv } from '../../../shared/utils/csv';
import { createListState } from '../../../shared/utils/list-state';
import { VehicleForm } from '../vehicle-form/vehicle-form';
import { VehicleStatusDialog } from '../vehicle-status-dialog/vehicle-status-dialog';
import { VehiclesFacade } from '../vehicles.facade';

type ViewMode = 'list' | 'grid';
const DOC_PRIORITY: DocumentStatus[] = ['expired', 'expiring', 'valid', 'no_expiry'];

@Component({
  selector: 'app-vehicles-page',
  imports: [
    RouterLink,
    TranslatePipe,
    ...FORMAT_PIPES,
    PageHeader,
    StatusBadge,
    EmptyState,
    Icon,
    Pagination,
    TableSkeleton,
    Dropdown,
    DropdownTrigger,
    Modal,
    VehicleForm,
    VehicleStatusDialog,
  ],
  templateUrl: './vehicles-page.html',
  styleUrl: './vehicles-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehiclesPage {
  private readonly repository = inject(VehicleRepository);
  private readonly facade = inject(VehiclesFacade);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly clock = inject(ClockService);
  protected readonly directory = inject(EntityDirectory);

  /** Query params (bound by the router) so dashboard links can pre-filter the list. */
  readonly status = input<string | undefined>();
  readonly type = input<string | undefined>();

  protected readonly statuses = VEHICLE_STATUSES;
  protected readonly types = VEHICLE_TYPES;
  protected readonly list = createListState({ pageSize: 10, sort: { field: 'fleetNumber', direction: 'asc' } });
  protected readonly statusFilter = linkedSignal<VehicleStatus | null>(() => this.asStatus(this.status()));
  protected readonly typeFilter = linkedSignal<VehicleType | null>(() => this.asType(this.type()));
  protected readonly view = signal<ViewMode>('list');

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Vehicle | null>(null);
  protected readonly statusTarget = signal<Vehicle | null>(null);

  protected readonly query = createQuery(
    () => ({
      search: this.list.search(),
      status: this.statusFilter(),
      type: this.typeFilter(),
      sort: this.list.sort(),
      page: this.list.page(),
      pageSize: this.list.pageSize(),
      version: this.repository.changes(),
    }),
    (params) => this.repository.list(params),
  );

  protected readonly counts = computed(() => {
    const all = this.directory.vehicles();
    const byStatus = new Map<VehicleStatus, number>();
    all.forEach((v) => byStatus.set(v.status, (byStatus.get(v.status) ?? 0) + 1));
    return { total: all.length, byStatus };
  });

  protected readonly hasFilters = computed(() => !!this.statusFilter() || !!this.typeFilter() || this.list.hasSearch());

  /** Worst document status per vehicle, for the documents column. */
  protected readonly documentStatus = computed(() => {
    const today = this.clock.today();
    const result = new Map<string, DocumentStatus>();
    for (const document of this.directory.documents()) {
      if (document.entityType !== 'vehicle') continue;
      const status = expiryStatus(document.expiryDate, today);
      const current = result.get(document.entityId);
      if (!current || DOC_PRIORITY.indexOf(status) < DOC_PRIORITY.indexOf(current)) result.set(document.entityId, status);
    }
    return result;
  });

  protected setStatus(status: VehicleStatus | null): void {
    this.statusFilter.set(status);
    this.list.resetPage();
    this.syncUrl();
  }

  protected setType(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.typeFilter.set(this.asType(value));
    this.list.resetPage();
    this.syncUrl();
  }

  protected clearFilters(): void {
    this.statusFilter.set(null);
    this.typeFilter.set(null);
    this.list.clearSearch();
    this.syncUrl();
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(vehicle: Vehicle): void {
    this.editing.set(vehicle);
    this.formOpen.set(true);
  }

  protected onSaved(vehicle: Vehicle, created: boolean): void {
    this.formOpen.set(false);
    this.toast.success(this.i18n.t(created ? 'vehicles.toasts.created' : 'vehicles.toasts.updated', { plate: vehicle.plateNumber }));
  }

  protected async remove(vehicle: Vehicle): Promise<void> {
    const linked = await this.facade.linkedTripCount(vehicle.id);
    if (linked > 0) {
      this.toast.warning(this.i18n.t('vehicles.toasts.cannotDelete', { count: linked }));
      return;
    }
    const confirmed = await this.confirm.ask({
      title: this.i18n.t('vehicles.confirmDelete.title', { plate: vehicle.plateNumber }),
      message: this.i18n.t('vehicles.confirmDelete.message'),
      confirmLabel: this.i18n.t('common.actions.delete'),
    });
    if (!confirmed) return;
    await this.facade.delete(vehicle);
    this.toast.success(this.i18n.t('vehicles.toasts.deleted', { plate: vehicle.plateNumber }));
  }

  protected async exportCsv(): Promise<void> {
    const result = await this.repository.list({ search: this.list.search(), status: this.statusFilter(), type: this.typeFilter(), sort: this.list.sort() });
    const t = (key: string) => this.i18n.t(key);
    downloadCsv(
      `${t('vehicles.csv.fileName')}-${this.clock.today()}`,
      [t('vehicles.fields.fleetNumber'), t('vehicles.fields.plateNumber'), t('vehicles.fields.make'), t('vehicles.fields.model'), t('vehicles.fields.year'), t('vehicles.fields.type'), t('vehicles.fields.status'), t('vehicles.fields.assignedDriver'), t('vehicles.fields.linkedTrailer'), t('vehicles.fields.odometer')],
      result.items.map((v) => [
        v.fleetNumber,
        v.plateNumber,
        v.make,
        v.model,
        v.year,
        t(`vehicles.types.${v.type}`),
        t(`vehicles.status.${v.status}`),
        v.assignedDriverId ? this.directory.driverName(v.assignedDriverId) : '',
        this.directory.trailer(v.linkedTrailerId)?.plateNumber ?? '',
        v.odometerKm,
      ]),
    );
    this.toast.success(t('common.toasts.exported'));
  }

  protected subtitle(): string {
    const counts = this.counts();
    return this.i18n.t('vehicles.subtitle', {
      total: this.format.number(counts.total),
      inTransit: counts.byStatus.get('in_transit') ?? 0,
      maintenance: counts.byStatus.get('maintenance') ?? 0,
    });
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      queryParams: { status: this.statusFilter(), type: this.typeFilter() },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private asStatus(value: string | null | undefined): VehicleStatus | null {
    return VEHICLE_STATUSES.includes(value as VehicleStatus) ? (value as VehicleStatus) : null;
  }

  private asType(value: string | null | undefined): VehicleType | null {
    return VEHICLE_TYPES.includes(value as VehicleType) ? (value as VehicleType) : null;
  }
}
