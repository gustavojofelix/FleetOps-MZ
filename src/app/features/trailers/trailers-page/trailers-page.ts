import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { TrailerRepository } from '../../../core/data-access/repositories';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TRAILER_STATUSES, TRAILER_TYPES, Trailer, TrailerStatus, TrailerType } from '../../../core/models';
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
import { TrailerForm } from '../trailer-form/trailer-form';
import { TrailerStatusDialog } from '../trailer-status-dialog/trailer-status-dialog';
import { TrailersFacade } from '../trailers.facade';

@Component({
  selector: 'app-trailers-page',
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
    TrailerForm,
    TrailerStatusDialog,
  ],
  templateUrl: './trailers-page.html',
  styleUrl: './trailers-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrailersPage {
  private readonly repository = inject(TrailerRepository);
  private readonly facade = inject(TrailersFacade);
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

  protected readonly statuses = TRAILER_STATUSES;
  protected readonly types = TRAILER_TYPES;
  protected readonly list = createListState({ pageSize: 10, sort: { field: 'fleetNumber', direction: 'asc' } });
  protected readonly statusFilter = linkedSignal<TrailerStatus | null>(() => this.asStatus(this.status()));
  protected readonly typeFilter = linkedSignal<TrailerType | null>(() => this.asType(this.type()));

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Trailer | null>(null);
  protected readonly statusTarget = signal<Trailer | null>(null);

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
    const all = this.directory.trailers();
    const byStatus = new Map<TrailerStatus, number>();
    all.forEach((t) => byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1));
    return { total: all.length, byStatus };
  });

  protected readonly hasFilters = computed(() => !!this.statusFilter() || !!this.typeFilter() || this.list.hasSearch());

  protected setStatus(status: TrailerStatus | null): void {
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

  protected openEdit(trailer: Trailer): void {
    this.editing.set(trailer);
    this.formOpen.set(true);
  }

  protected onSaved(trailer: Trailer, created: boolean): void {
    this.formOpen.set(false);
    this.toast.success(this.i18n.t(created ? 'trailers.toasts.created' : 'trailers.toasts.updated', { plate: trailer.plateNumber }));
  }

  protected async remove(trailer: Trailer): Promise<void> {
    try {
      const linked = await this.facade.linkedTripCount(trailer.id);
      if (linked > 0) {
        this.toast.warning(this.i18n.t('trailers.toasts.cannotDelete', { count: linked }));
        return;
      }
      const confirmed = await this.confirm.ask({
        title: this.i18n.t('trailers.confirmDelete.title', { plate: trailer.plateNumber }),
        message: this.i18n.t('trailers.confirmDelete.message'),
        confirmLabel: this.i18n.t('common.actions.delete'),
      });
      if (!confirmed) return;
      await this.facade.delete(trailer);
      this.toast.success(this.i18n.t('trailers.toasts.deleted', { plate: trailer.plateNumber }));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }

  protected async exportCsv(): Promise<void> {
    const result = await this.repository.list({ search: this.list.search(), status: this.statusFilter(), type: this.typeFilter(), sort: this.list.sort() });
    const t = (key: string) => this.i18n.t(key);
    downloadCsv(
      `${t('trailers.csv.fileName')}-${this.clock.today()}`,
      [
        t('trailers.fields.fleetNumber'),
        t('trailers.fields.plateNumber'),
        t('trailers.fields.make'),
        t('trailers.fields.year'),
        t('trailers.fields.type'),
        t('trailers.fields.axles'),
        `${t('trailers.fields.capacityTonnes')} (${t('common.units.tonnes')})`,
        `${t('trailers.fields.capacityLitres')} (${t('common.units.litres')})`,
        t('trailers.fields.status'),
        t('trailers.fields.assignedVehicle'),
        t('trailers.fields.lastInspectionDate'),
        t('trailers.fields.inspectionExpiry'),
      ],
      result.items.map((trailer) => [
        trailer.fleetNumber,
        trailer.plateNumber,
        trailer.make,
        trailer.year,
        t(`trailers.types.${trailer.type}`),
        trailer.axles,
        trailer.capacityTonnes,
        trailer.capacityLitres,
        t(`trailers.status.${trailer.status}`),
        trailer.assignedVehicleId ? this.directory.plate(trailer.assignedVehicleId) : '',
        trailer.lastInspectionDate,
        trailer.inspectionExpiry,
      ]),
    );
    this.toast.success(t('common.toasts.exported'));
  }

  protected subtitle(): string {
    const counts = this.counts();
    return this.i18n.t('trailers.subtitle', {
      total: this.format.number(counts.total),
      inUse: counts.byStatus.get('in_use') ?? 0,
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

  private asStatus(value: string | null | undefined): TrailerStatus | null {
    return TRAILER_STATUSES.includes(value as TrailerStatus) ? (value as TrailerStatus) : null;
  }

  private asType(value: string | null | undefined): TrailerType | null {
    return TRAILER_TYPES.includes(value as TrailerType) ? (value as TrailerType) : null;
  }
}
