import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ACTIVE_TRIP_STATUSES, VEHICLE_STATUSES, Vehicle, VehicleStatus } from '../../../core/models';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { Icon } from '../../../shared/ui/icon/icon';
import { Modal } from '../../../shared/ui/modal/modal';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { VehiclesFacade } from '../vehicles.facade';

/** Manual status change with a reason that is kept in the vehicle's status history. */
@Component({
  selector: 'app-vehicle-status-dialog',
  imports: [Modal, TranslatePipe, Icon],
  templateUrl: './vehicle-status-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleStatusDialog {
  /** Dialog is open while a vehicle is set. */
  readonly vehicle = input<Vehicle | null>(null);
  readonly closed = output<void>();

  private readonly facade = inject(VehiclesFacade);
  private readonly directory = inject(EntityDirectory);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  /** "In transit" is driven by trips, so it is not offered as a manual status. */
  protected readonly options = VEHICLE_STATUSES.filter((status) => status !== 'in_transit');
  protected readonly selected = linkedSignal<VehicleStatus>(() => {
    const current = this.vehicle()?.status ?? 'available';
    return current === 'available' ? 'maintenance' : 'available';
  });
  /** Cleared whenever a different vehicle is opened. */
  protected readonly reason = linkedSignal({ source: this.vehicle, computation: () => '' });
  protected readonly saving = signal(false);

  protected readonly activeTrip = computed(() => {
    const vehicle = this.vehicle();
    if (!vehicle) return null;
    return this.directory.trips().find((trip) => trip.vehicleId === vehicle.id && ACTIVE_TRIP_STATUSES.includes(trip.status)) ?? null;
  });

  protected async confirm(): Promise<void> {
    const vehicle = this.vehicle();
    if (!vehicle) return;
    this.saving.set(true);
    try {
      const status = this.selected();
      await this.facade.changeStatus(vehicle.id, status, this.reason().trim());
      this.toast.success(
        this.i18n.t('vehicles.toasts.statusChanged', { plate: vehicle.plateNumber, status: this.i18n.t('vehicles.status.' + status) }),
      );
      this.closed.emit();
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    } finally {
      this.saving.set(false);
    }
  }
}
