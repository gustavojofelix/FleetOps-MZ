import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { maintenanceDisplayStatus, maintenanceTotalCost } from '../../../core/domain/maintenance-rules';
import { CurrencyService } from '../../../core/formatting/currency.service';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ACTIVE_TRIP_STATUSES, FINISHED_TRIP_STATUSES } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { FleetAnalytics } from '../../../core/services/fleet-analytics.service';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { ExpiryBadge } from '../../../shared/ui/expiry-badge/expiry-badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiCard } from '../../../shared/ui/kpi-card/kpi-card';
import { Modal } from '../../../shared/ui/modal/modal';
import { Money } from '../../../shared/ui/money/money';
import { Breadcrumb, PageHeader } from '../../../shared/ui/page-header/page-header';
import { StatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { VehicleForm } from '../vehicle-form/vehicle-form';
import { VehicleStatusDialog } from '../vehicle-status-dialog/vehicle-status-dialog';
import { Vehicle } from '../../../core/models';
import { FormatService } from '../../../core/formatting/format.service';

export type VehicleTab = 'overview' | 'trips' | 'fuel' | 'maintenance' | 'documents';
const TABS: VehicleTab[] = ['overview', 'trips', 'fuel', 'maintenance', 'documents'];

@Component({
  selector: 'app-vehicle-detail-page',
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
    VehicleForm,
    VehicleStatusDialog,
  ],
  templateUrl: './vehicle-detail-page.html',
  styleUrl: './vehicle-detail-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleDetailPage {
  /** Route param and query param, bound by the router. */
  readonly id = input.required<string>();
  readonly tab = input<string | undefined>();

  protected readonly directory = inject(EntityDirectory);
  private readonly analytics = inject(FleetAnalytics);
  private readonly currency = inject(CurrencyService);
  private readonly format = inject(FormatService);
  private readonly clock = inject(ClockService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslationService);
  private readonly toast = inject(ToastService);

  protected readonly tabs = TABS;
  protected readonly activeTab = linkedSignal<VehicleTab>(() => (TABS.includes(this.tab() as VehicleTab) ? (this.tab() as VehicleTab) : 'overview'));
  protected readonly editOpen = signal(false);
  protected readonly statusTarget = signal<Vehicle | null>(null);

  protected readonly vehicle = computed(() => this.directory.vehicle(this.id()));
  protected readonly driver = computed(() => this.directory.driver(this.vehicle()?.assignedDriverId));
  protected readonly trailer = computed(() => this.directory.trailer(this.vehicle()?.linkedTrailerId));

  protected readonly breadcrumbs = computed<Breadcrumb[]>(() => [
    { label: 'vehicles.detail.backToList', link: '/vehicles', translate: true },
    { label: this.vehicle()?.plateNumber ?? '…' },
  ]);

  protected readonly trips = computed(() =>
    this.directory
      .trips()
      .filter((trip) => trip.vehicleId === this.id())
      .sort((a, b) => b.plannedDeparture.localeCompare(a.plannedDeparture)),
  );
  protected readonly currentTrip = computed(() => this.trips().find((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status)) ?? null);

  protected readonly fuelRecords = computed(() => {
    const analysis = this.analytics.fuelAnalysis();
    return this.directory
      .fuel()
      .filter((record) => record.vehicleId === this.id())
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .map((record) => ({ record, analysis: analysis.get(record.id) }));
  });

  protected readonly maintenance = computed(() => {
    const today = this.clock.today();
    return this.directory
      .maintenance()
      .filter((record) => record.vehicleId === this.id())
      .sort((a, b) => b.plannedDate.localeCompare(a.plannedDate))
      .map((record) => ({ record, status: maintenanceDisplayStatus(record, today), total: maintenanceTotalCost(record) }));
  });

  protected readonly documents = computed(() =>
    this.directory
      .documents()
      .filter((document) => document.entityType === 'vehicle' && document.entityId === this.id())
      .sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999')),
  );

  protected readonly nextService = computed(
    () =>
      this.maintenance()
        .map((m) => m.record)
        .find((record) => record.status === 'completed' && record.nextServiceKm) ?? null,
  );

  protected readonly kpis = computed(() => {
    const finished = this.trips().filter((trip) => FINISHED_TRIP_STATUSES.includes(trip.status));
    const active = this.trips().filter((trip) => ACTIVE_TRIP_STATUSES.includes(trip.status));
    const readings = this.fuelRecords()
      .map((entry) => entry.analysis)
      .filter((analysis) => analysis?.consumptionL100km != null && !analysis.warnings.length)
      .map((analysis) => analysis!.consumptionL100km!);
    const consumption = readings.length ? readings.reduce((a, b) => a + b, 0) / readings.length : null;
    const completedMaintenance = this.maintenance().filter((m) => m.record.status === 'completed');
    const maintenanceCost = this.currency.sumToReporting(
      completedMaintenance.map((m) => ({ amount: m.total, currency: m.record.currency })),
    );
    const revenue = finished.reduce((sum, trip) => sum + (this.analytics.profitabilityOf(trip.id)?.revenue ?? 0), 0);
    return {
      finished: finished.length,
      active: active.length,
      consumption,
      maintenanceCost,
      maintenanceCount: completedMaintenance.length,
      revenue,
    };
  });

  protected selectTab(tab: VehicleTab): void {
    this.activeTab.set(tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'overview' ? null : tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected onTabKeydown(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = TABS[(index + delta + TABS.length) % TABS.length];
    this.selectTab(next);
    queueMicrotask(() => document.getElementById(`vehicle-tab-${next}`)?.focus());
  }

  protected onSaved(vehicle: Vehicle): void {
    this.editOpen.set(false);
    this.toast.success(this.i18n.t('vehicles.toasts.updated', { plate: vehicle.plateNumber }));
  }

  protected consumptionText(value: number | null): string {
    return value === null ? '—' : `${this.format.number(value, 1)} ${this.i18n.t('common.units.l100km')}`;
  }
}
