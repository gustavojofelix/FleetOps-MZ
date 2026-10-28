import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TrackingPhase, nearestPlace } from '../../../../core/domain/fleet-tracking';
import { FORMAT_PIPES } from '../../../../core/formatting/format.pipes';
import { FormatService } from '../../../../core/formatting/format.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { EntityDirectory } from '../../../../core/services/entity-directory.service';
import { ExpiryBadge } from '../../../../shared/ui/expiry-badge/expiry-badge';
import { Icon } from '../../../../shared/ui/icon/icon';
import { IconName } from '../../../../shared/ui/icon/icon-registry';
import { Modal } from '../../../../shared/ui/modal/modal';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { UnitView } from '../fleet-map.model';

type QuickMessageKey =
  | 'location'
  | 'eta'
  | 'rest'
  | 'status'
  | 'photos'
  | 'support'
  | 'loadingDone'
  | 'checklist'
  | 'pod'
  | 'returnLoad'
  | 'availability'
  | 'report';

interface QuickMessage {
  key: QuickMessageKey;
  icon: IconName;
}

/** Quick WhatsApp messages that make sense for what the driver is doing right now. */
const QUICK_MESSAGES: Record<TrackingPhase, QuickMessage[]> = {
  moving: [
    { key: 'location', icon: 'map-pin' },
    { key: 'eta', icon: 'clock' },
    { key: 'rest', icon: 'coffee' },
  ],
  stopped: [
    { key: 'status', icon: 'circle-alert' },
    { key: 'photos', icon: 'camera' },
    { key: 'support', icon: 'shield-check' },
  ],
  loading: [
    { key: 'loadingDone', icon: 'package' },
    { key: 'checklist', icon: 'clipboard-check' },
  ],
  arrived: [
    { key: 'pod', icon: 'file-check' },
    { key: 'returnLoad', icon: 'route' },
  ],
  idle: [
    { key: 'availability', icon: 'calendar-clock' },
    { key: 'report', icon: 'building' },
  ],
};

/** Places closer than this are reported as "in <place>" rather than "<n> km from <place>". */
const IN_PLACE_KM = 5;

/**
 * Popup opened from the fleet map for one driver: contact options (call, WhatsApp, SMS, quick
 * messages adapted to the trip phase), the live trip summary and shortcuts to related actions.
 */
@Component({
  selector: 'app-driver-popup',
  imports: [RouterLink, TranslatePipe, ...FORMAT_PIPES, ExpiryBadge, Icon, Modal],
  templateUrl: './driver-popup.html',
  styleUrl: './driver-popup.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriverPopup {
  private readonly directory = inject(EntityDirectory);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  private readonly toast = inject(ToastService);

  /** The driver to show; null keeps the popup closed. */
  readonly view = input<UnitView | null>(null);
  /** Simulated instant (epoch ms) of the map clock. */
  readonly nowMs = input.required<number>();
  readonly following = input(false);
  readonly closed = output<void>();
  readonly follow = output<string>();

  protected readonly driver = computed(() => this.directory.driver(this.view()?.unit.driverId));
  protected readonly trip = computed(() => this.view()?.unit.trip ?? null);
  protected readonly customer = computed(() => this.directory.customerName(this.trip()?.customerId));
  protected readonly phoneDigits = computed(() => (this.driver()?.phone ?? '').replace(/\D/g, ''));

  protected readonly location = computed(() => {
    const view = this.view();
    if (!view) return '';
    const near = nearestPlace(view.unit.position);
    return near.km < IN_PLACE_KM
      ? this.i18n.t('dashboard.map.popup.inPlace', { place: near.name })
      : this.i18n.t('dashboard.map.popup.nearPlace', { distance: this.format.distance(near.km), place: near.name });
  });

  protected readonly eta = computed(() => {
    const eta = this.view()?.unit.etaMs;
    return eta == null ? null : new Date(eta).toISOString();
  });

  /** Hours since departure while the driver is on the road. */
  protected readonly hoursOnRoad = computed(() => {
    const unit = this.view()?.unit;
    const trip = unit?.trip;
    if (!unit || !trip || (unit.phase !== 'moving' && unit.phase !== 'stopped')) return null;
    const start = Date.parse(trip.actualDeparture ?? trip.plannedDeparture);
    return Math.max(0, (this.nowMs() - start) / 3_600_000);
  });

  protected readonly quickMessages = computed(() => {
    const view = this.view();
    if (!view) return [];
    const trip = view.unit.trip;
    const params = {
      name: this.driver()?.firstName ?? view.name,
      reference: trip?.reference ?? '',
      destination: trip?.destination.city ?? '',
      eta: this.eta() ? this.format.date(this.eta(), 'datetime') : '—',
      city: this.driver()?.city ?? view.place,
    };
    return QUICK_MESSAGES[view.unit.phase].map((message) => {
      const text = this.i18n.t(`dashboard.map.popup.messages.${message.key}.text`, params);
      return {
        ...message,
        label: this.i18n.t(`dashboard.map.popup.messages.${message.key}.label`),
        text,
        url: this.whatsappUrl(text),
      };
    });
  });

  protected whatsappUrl(text?: string): string {
    const base = `https://wa.me/${this.phoneDigits()}`;
    return text ? `${base}?text=${encodeURIComponent(text)}` : base;
  }

  protected async copyPhone(): Promise<void> {
    await this.copy(this.driver()?.phone ?? '');
  }

  /** Copies a Google Maps link to the simulated position, ready to paste into a chat. */
  protected async shareLocation(): Promise<void> {
    const view = this.view();
    if (!view) return;
    const [lat, lng] = view.unit.position.map((value) => value.toFixed(5));
    const text = this.i18n.t('dashboard.map.popup.shareText', {
      name: view.name,
      plate: view.plate,
      location: this.location(),
      url: `https://www.google.com/maps?q=${lat},${lng}`,
    });
    await this.copy(text);
  }

  protected toggleFollow(): void {
    const view = this.view();
    if (view) this.follow.emit(view.unit.driverId);
  }

  private async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success(this.i18n.t('common.toasts.copied'));
    } catch {
      this.toast.error(this.i18n.t('common.toasts.error'));
    }
  }
}
