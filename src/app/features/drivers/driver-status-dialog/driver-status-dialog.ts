import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ACTIVE_TRIP_STATUSES, DRIVER_STATUSES, Driver, DriverStatus } from '../../../core/models';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { DriversFacade } from '../drivers.facade';
import { driverName } from '../driver-utils';

/** Manual availability change (active / on leave / inactive). */
@Component({
  selector: 'app-driver-status-dialog',
  imports: [Modal, TranslatePipe, Icon],
  templateUrl: './driver-status-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriverStatusDialog {
  /** Dialog is open while a driver is set. */
  readonly driver = input<Driver | null>(null);
  readonly closed = output<void>();

  private readonly facade = inject(DriversFacade);
  private readonly directory = inject(EntityDirectory);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  /** "On a trip" is driven by trips, so it is not offered as a manual status. */
  protected readonly options = DRIVER_STATUSES.filter((status) => status !== 'on_trip');
  protected readonly selected = linkedSignal<DriverStatus>(() => {
    const current = this.driver()?.status ?? 'active';
    return current === 'active' ? 'on_leave' : 'active';
  });
  protected readonly saving = signal(false);
  protected readonly name = computed(() => {
    const driver = this.driver();
    return driver ? driverName(driver) : '';
  });

  protected readonly activeTrip = computed(() => {
    const driver = this.driver();
    if (!driver) return null;
    return this.directory.trips().find((trip) => trip.driverId === driver.id && ACTIVE_TRIP_STATUSES.includes(trip.status)) ?? null;
  });

  /** Plate of the vehicle that will be released when the driver becomes inactive. */
  protected readonly releasedPlate = computed(() => {
    const driver = this.driver();
    if (!driver?.assignedVehicleId || this.selected() !== 'inactive') return null;
    return this.directory.plate(driver.assignedVehicleId);
  });

  protected async confirm(): Promise<void> {
    const driver = this.driver();
    if (!driver || this.activeTrip()) return;
    this.saving.set(true);
    try {
      const status = this.selected();
      await this.facade.changeStatus(driver.id, status);
      this.toast.success(this.i18n.t('drivers.toasts.statusChanged', { name: driverName(driver), status: this.i18n.t('drivers.status.' + status) }));
      this.closed.emit();
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }
}
