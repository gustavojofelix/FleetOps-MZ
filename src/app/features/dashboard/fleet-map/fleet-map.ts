import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type * as Leaflet from 'leaflet';
import {
  MAP_REGION,
  TrackingPhase,
  activeTrackableTrips,
  isInMapRegion,
  splitPath,
  trackFleet,
  tripPath,
} from '../../../core/domain/fleet-tracking';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { TooltipDirective } from '../../../shared/ui/tooltip/tooltip.directive';
import { DriverPopup } from './driver-popup/driver-popup';
import { UnitView } from './fleet-map.model';

/** Simulated milliseconds per real millisecond. */
const SPEEDS = [1, 60, 600, 3600] as const;
const TICK_MS = 200;

const PHASE_ORDER: readonly TrackingPhase[] = ['moving', 'stopped', 'loading', 'arrived', 'idle'];
const PHASE_BADGE: Record<TrackingPhase, string> = {
  moving: 'badge--accent',
  stopped: 'badge--danger',
  loading: 'badge--warning',
  arrived: 'badge--success',
  idle: '',
};

// Standard OpenStreetMap tiles; the dark theme darkens them with a CSS filter (see fleet-map.scss).
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

interface UnitLayers {
  marker: Leaflet.Marker;
  iconKey: string;
  done: Leaflet.Polyline | null;
  ahead: Leaflet.Polyline | null;
}

/**
 * Live map of where every on-duty driver is. Positions are simulated from the active trips
 * (see core/domain/fleet-tracking.ts) on a clock that can be paused and accelerated.
 */
@Component({
  selector: 'app-fleet-map',
  imports: [RouterLink, TranslatePipe, ...FORMAT_PIPES, EmptyState, Icon, TooltipDirective, DriverPopup],
  templateUrl: './fleet-map.html',
  styleUrl: './fleet-map.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FleetMap {
  private readonly directory = inject(EntityDirectory);
  private readonly clock = inject(ClockService);
  private readonly i18n = inject(TranslationService);
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');

  protected readonly speeds = SPEEDS;
  protected readonly phases = PHASE_ORDER;
  protected readonly loading = this.directory.loading;

  private readonly startMs = Date.parse(this.clock.now());
  protected readonly simMs = signal(this.startMs);
  protected readonly speed = signal<number>(600);
  protected readonly playing = signal(!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  protected readonly selectedId = signal<string | null>(null);
  /** Driver whose popup is open. */
  protected readonly popupId = signal<string | null>(null);
  /** Driver the map keeps centred on as the simulation runs. */
  protected readonly followId = signal<string | null>(null);
  protected readonly mapState = signal<'loading' | 'ready' | 'error'>('loading');

  protected readonly simTime = computed(() => new Date(this.simMs()).toISOString());

  protected readonly units = computed<UnitView[]>(() =>
    trackFleet(this.directory.trips(), this.directory.drivers(), this.simMs())
      .sort((a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase))
      .map((unit) => {
        const driver = this.directory.driver(unit.driverId);
        return {
          unit,
          name: this.directory.driverName(unit.driverId),
          initials: driver ? `${driver.firstName[0]}${driver.lastName[0]}` : '?',
          plate: this.directory.plate(unit.vehicleId),
          place: unit.trip ? this.directory.routeLabel(unit.trip) : (driver?.city ?? '—'),
          badge: PHASE_BADGE[unit.phase],
        };
      }),
  );

  protected readonly popupView = computed(() => this.units().find((view) => view.unit.driverId === this.popupId()) ?? null);
  protected readonly followedView = computed(() => this.units().find((view) => view.unit.driverId === this.followId()) ?? null);

  /** Active trips on corridors outside the mapped region (Maputo, Joanesburgo). */
  protected readonly outsideRegion = computed(() =>
    activeTrackableTrips(this.directory.trips()).filter((trip) => !isInMapRegion(tripPath(trip))),
  );
  protected readonly activeTripsQuery = { status: 'preparing,in_transit,delayed' };

  protected readonly counts = computed(() => {
    const counts = Object.fromEntries(PHASE_ORDER.map((phase) => [phase, 0])) as Record<TrackingPhase, number>;
    for (const { unit } of this.units()) counts[unit.phase]++;
    return counts;
  });

  private leaflet: typeof Leaflet | null = null;
  private region: Leaflet.LatLngBounds | null = null;
  private map: Leaflet.Map | null = null;
  private readonly layers = new Map<string, UnitLayers>();

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect((onCleanup) => {
      if (!this.playing()) return;
      const timer = setInterval(() => this.simMs.update((ms) => ms + TICK_MS * this.speed()), TICK_MS);
      onCleanup(() => clearInterval(timer));
    });

    afterNextRender(() => {
      let resize: ResizeObserver | null = null;
      import('leaflet')
        .then((L) => {
          if (this.map || !this.canvas()) return;
          this.leaflet = L;
          const region = L.latLngBounds(MAP_REGION.southWest, MAP_REGION.northEast);
          this.region = region;
          this.map = L.map(this.canvas().nativeElement, {
            zoomControl: true,
            attributionControl: true,
            maxZoom: 13,
            maxBounds: region.pad(0.15),
            maxBoundsViscosity: 1,
          });
          L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19, bounds: region.pad(1) }).addTo(this.map);
          this.fitRegion();
          resize = new ResizeObserver(() => {
            this.map?.invalidateSize();
            this.lockZoomToRegion();
          });
          resize.observe(this.canvas().nativeElement);
          // Panning by hand takes over from "follow on map".
          this.map.on('dragstart', () => this.followId.set(null));
          this.mapState.set('ready');
        })
        .catch(() => this.mapState.set('error'));
      destroyRef.onDestroy(() => {
        resize?.disconnect();
        this.map?.remove();
        this.map = null;
      });
    });

    effect(() => {
      const units = this.units();
      const selected = this.selectedId();
      if (this.mapState() !== 'ready' || this.loading()) return;
      this.syncLayers(units, selected);
      const followed = this.followedView();
      if (followed) this.map?.panTo(followed.unit.position, { animate: false });
    });
  }

  protected togglePlay(): void {
    this.playing.update((playing) => !playing);
  }

  protected reset(): void {
    this.simMs.set(this.startMs);
  }

  /** Highlights the driver, centres the map on them and opens their popup. */
  protected open(driverId: string): void {
    this.selectedId.set(driverId);
    this.popupId.set(driverId);
    if (this.followId() !== driverId) this.followId.set(null);
    const view = this.units().find((item) => item.unit.driverId === driverId);
    if (view && this.map) this.map.flyTo(view.unit.position, Math.max(this.map.getZoom(), 7), { duration: 0.8 });
  }

  protected closePopup(): void {
    this.popupId.set(null);
  }

  /** Toggles "follow on map" for a driver and closes the popup so the map is visible. */
  protected toggleFollow(driverId: string): void {
    const follow = this.followId() !== driverId;
    this.followId.set(follow ? driverId : null);
    this.selectedId.set(driverId);
    this.popupId.set(null);
    const view = this.units().find((item) => item.unit.driverId === driverId);
    if (follow && view && this.map) this.map.setView(view.unit.position, Math.max(this.map.getZoom(), 8));
  }

  protected stopFollowing(): void {
    this.followId.set(null);
  }

  protected fitAll(): void {
    this.selectedId.set(null);
    this.followId.set(null);
    this.fitRegion();
  }

  protected speedLabel(speed: number): string {
    return `${speed}×`;
  }

  private syncLayers(units: UnitView[], selected: string | null): void {
    const L = this.leaflet!;
    const map = this.map!;
    const seen = new Set<string>();

    for (const view of units) {
      const { unit } = view;
      seen.add(unit.driverId);
      const isSelected = unit.driverId === selected;
      const dimmed = selected !== null && !isSelected;
      let layers = this.layers.get(unit.driverId);

      if (!layers) {
        // A placeholder divIcon avoids Leaflet's default image icon; the real one is set below.
        const icon = L.divIcon({ className: 'fleet-pin-host', iconSize: [28, 28] });
        const marker = L.marker(unit.position, { icon, title: `${view.name} · ${view.plate}`, riseOnHover: true })
          .bindTooltip(`<strong>${escapeHtml(view.name)}</strong><br>${escapeHtml(`${view.plate} · ${view.place}`)}`, { direction: 'top', offset: [0, -14] })
          .on('click', () => this.open(unit.driverId))
          .addTo(map);
        layers = { marker, iconKey: '', done: null, ahead: null };
        if (unit.path) {
          layers.ahead = L.polyline([], { className: 'fleet-route fleet-route--ahead', interactive: false }).addTo(map);
          layers.done = L.polyline([], { className: `fleet-route fleet-route--done fleet-route--${unit.phase}`, interactive: false }).addTo(map);
        }
        this.layers.set(unit.driverId, layers);
      }

      layers.marker.setLatLng(unit.position);
      const iconKey = `${unit.phase}|${isSelected}|${dimmed}`;
      if (iconKey !== layers.iconKey) {
        layers.iconKey = iconKey;
        layers.marker.setIcon(
          L.divIcon({
            className: 'fleet-pin-host',
            html: `<span class="fleet-pin fleet-pin--${unit.phase}${isSelected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}">${escapeHtml(view.initials)}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
        );
        layers.marker.setZIndexOffset(isSelected ? 1000 : unit.phase === 'idle' ? -100 : 0);
        const state = `${isSelected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`;
        layers.done?.getElement()?.setAttribute('class', `fleet-route fleet-route--done fleet-route--${unit.phase}${state}`);
        layers.ahead?.getElement()?.setAttribute('class', `fleet-route fleet-route--ahead${state}`);
      }

      if (unit.path && layers.done && layers.ahead) {
        const { done, ahead } = splitPath(unit.path, unit.progress);
        layers.done.setLatLngs(done);
        layers.ahead.setLatLngs(ahead);
        if (isSelected) layers.done.bringToFront();
      }
    }

    for (const [driverId, layers] of this.layers) {
      if (seen.has(driverId)) continue;
      layers.marker.remove();
      layers.done?.remove();
      layers.ahead?.remove();
      this.layers.delete(driverId);
    }
  }

  /** Shows the whole region and prevents zooming out beyond it. */
  private fitRegion(): void {
    if (!this.map || !this.region) return;
    this.lockZoomToRegion();
    this.map.fitBounds(this.region, { padding: [8, 8] });
  }

  private lockZoomToRegion(): void {
    if (this.map && this.region) this.map.setMinZoom(this.map.getBoundsZoom(this.region, false, this.leaflet?.point(8, 8)));
  }

  protected phaseLabel(phase: TrackingPhase): string {
    return this.i18n.t(`dashboard.map.phases.${phase}`);
  }
}
