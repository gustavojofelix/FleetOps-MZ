import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { daysUntilExpiry } from '../../../core/domain/document-status';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ACTIVE_TRIP_STATUSES, FINISHED_TRIP_STATUSES, Trailer } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ExpiryBadge } from '../../../shared/ui/expiry-badge/expiry-badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiCard } from '../../../shared/ui/kpi-card/kpi-card';
import { Modal } from '../../../shared/ui/modal/modal';
import { Money } from '../../../shared/ui/money/money';
import { Breadcrumb, PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { TrailerForm } from '../trailer-form/trailer-form';
import { TrailerStatusDialog } from '../trailer-status-dialog/trailer-status-dialog';

export type TrailerTab = 'overview' | 'trips' | 'documents';
const TABS: TrailerTab[] = ['overview', 'trips', 'documents'];

@Component({
  selector: 'app-trailer-detail-page',
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
    TrailerForm,
    TrailerStatusDialog,
  ],
  templateUrl: './trailer-detail-page.html',
  styleUrl: './trailer-detail-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrailerDetailPage {
  /** Route param and query param, bound by the router. */
  readonly id = input.required<string>();
  readonly tab = input<string | undefined>();

  protected readonly directory = inject(EntityDirectory);
  private readonly clock = inject(ClockService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslationService);
  private readonly toast = inject(ToastService);

  protected readonly tabs = TABS;
  protected readonly activeTab = linkedSignal<TrailerTab>(() => (TABS.includes(this.tab() as TrailerTab) ? (this.tab() as TrailerTab) : 'overview'));
  protected readonly editOpen = signal(false);
  protected readonly statusTarget = signal<Trailer | null>(null);

  protected readonly trailer = computed(() => this.directory.trailer(this.id()));
  protected readonly vehicle = computed(() => this.directory.vehicle(this.trailer()?.assignedVehicleId));

  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => [
    { label: 'trailers.detail.backToList', link: '/trailers', translate: true },
    { label: this.trailer()?.plateNumber ?? '…' },
  ]);

  protected readonly trips = computed(() =>
    this.directory
      .trips()
      .filter((trip) => trip.trailerId === this.id())
      .sort((a, b) => b.plannedDeparture.localeCompare(a.plannedDeparture)),
  );
  protected readonly currentTrip = computed(() => this.trips().find((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status)) ?? null);

  protected readonly documents = computed(() =>
    this.directory
      .documents()
      .filter((document) => document.entityType === 'trailer' && document.entityId === this.id())
      .sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999')),
  );

  protected readonly kpis = computed(() => {
    const finished = this.trips().filter((trip) => FINISHED_TRIP_STATUSES.includes(trip.status));
    return {
      finished: finished.length,
      active: this.trips().filter((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status)).length,
      km: finished.reduce((sum, trip) => sum + (trip.actualDistanceKm ?? trip.plannedDistanceKm), 0),
      inspectionDays: daysUntilExpiry(this.trailer()?.inspectionExpiry, this.clock.today()),
    };
  });

  protected readonly inspectionValue = computed(() => {
    this.i18n.revision();
    const days = this.kpis().inspectionDays;
    if (days === null) return '—';
    if (days < 0) return this.i18n.t('trailers.detail.kpis.inspectionExpired');
    return this.i18n.t('trailers.detail.kpis.inspectionDays', { count: days });
  });

  protected selectTab(tab: TrailerTab): void {
    this.activeTab.set(tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    this.selectTab(next);
    queueMicrotask(() => document.getElementById(`trailer-tab-${next}`)?.focus());
  }

  protected onSaved(trailer: Trailer): void {
    this.editOpen.set(false);
    this.toast.success(this.i18n.t('trailers.toasts.updated', { plate: trailer.plateNumber }));
  }
}
