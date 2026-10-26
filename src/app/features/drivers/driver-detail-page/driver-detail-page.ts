import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { daysUntilExpiry } from '../../../core/domain/document-status';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ACTIVE_TRIP_STATUSES, Driver, FINISHED_TRIP_STATUSES } from '../../../core/models';
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
import { DriverForm } from '../driver-form/driver-form';
import { DriverIncidentDialog } from '../driver-incident-dialog/driver-incident-dialog';
import { DriverStatusDialog } from '../driver-status-dialog/driver-status-dialog';
import { INCIDENT_SEVERITY_TONES, driverInitials, driverName } from '../driver-utils';

export type DriverTab = 'overview' | 'trips' | 'incidents' | 'documents';
const TABS: DriverTab[] = ['overview', 'trips', 'incidents', 'documents'];

@Component({
  selector: 'app-driver-detail-page',
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
    DriverForm,
    DriverStatusDialog,
    DriverIncidentDialog,
  ],
  templateUrl: './driver-detail-page.html',
  styleUrl: './driver-detail-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriverDetailPage {
  /** Route param and query param, bound by the router. */
  readonly id = input.required<string>();
  readonly tab = input<string | undefined>();

  protected readonly directory = inject(EntityDirectory);
  private readonly clock = inject(ClockService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslationService);
  private readonly toast = inject(ToastService);

  protected readonly tabs = TABS;
  protected readonly severityTones = INCIDENT_SEVERITY_TONES;
  protected readonly activeTab = linkedSignal<DriverTab>(() => (TABS.includes(this.tab() as DriverTab) ? (this.tab() as DriverTab) : 'overview'));
  protected readonly editOpen = signal(false);
  protected readonly incidentOpen = signal(false);
  protected readonly statusTarget = signal<Driver | null>(null);

  protected readonly driver = computed(() => this.directory.driver(this.id()));
  protected readonly vehicle = computed(() => this.directory.vehicle(this.driver()?.assignedVehicleId));
  protected readonly name = computed(() => {
    const driver = this.driver();
    return driver ? driverName(driver) : '…';
  });
  protected readonly initials = computed(() => {
    const driver = this.driver();
    return driver ? driverInitials(driver) : '';
  });

  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => [
    { label: 'drivers.detail.backToList', link: '/drivers', translate: true },
    { label: this.name() },
  ]);

  protected readonly trips = computed(() =>
    this.directory
      .trips()
      .filter((trip) => trip.driverId === this.id())
      .sort((a, b) => b.plannedDeparture.localeCompare(a.plannedDeparture)),
  );
  protected readonly currentTrip = computed(() => this.trips().find((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status)) ?? null);

  protected readonly incidents = computed(() =>
    (this.driver()?.incidents ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)),
  );

  protected readonly documents = computed(() =>
    this.directory
      .documents()
      .filter((document) => document.entityType === 'driver' && document.entityId === this.id())
      .sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999')),
  );

  protected readonly kpis = computed(() => {
    const finished = this.trips().filter((trip) => FINISHED_TRIP_STATUSES.includes(trip.status));
    const km = finished.reduce((sum, trip) => sum + (trip.actualDistanceKm ?? trip.plannedDistanceKm), 0);
    const incidents = this.incidents();
    return {
      finished: finished.length,
      km,
      incidents: incidents.length,
      highIncidents: incidents.filter((incident) => incident.severity === 'high').length,
      licenceDays: daysUntilExpiry(this.driver()?.licenceExpiry, this.clock.today()),
    };
  });

  protected readonly licenceValue = computed(() => {
    this.i18n.revision();
    const days = this.kpis().licenceDays;
    if (days === null) return '—';
    if (days < 0) return this.i18n.t('drivers.detail.kpis.licenceExpired');
    return this.i18n.t('drivers.detail.kpis.licenceDays', { count: days });
  });

  protected selectTab(tab: DriverTab): void {
    this.activeTab.set(tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    this.selectTab(next);
    queueMicrotask(() => document.getElementById(`driver-tab-${next}`)?.focus());
  }

  protected onSaved(driver: Driver): void {
    this.editOpen.set(false);
    this.toast.success(this.i18n.t('drivers.toasts.updated', { name: driverName(driver) }));
  }
}
