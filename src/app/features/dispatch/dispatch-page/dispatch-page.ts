import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { createQuery } from '../../../core/data-access/query';
import { matchesSearch } from '../../../core/data-access/query-utils';
import { TripRepository } from '../../../core/data-access/repositories';
import { canTransition } from '../../../core/domain/trip-rules';
import { FORMAT_PIPES } from '../../../core/formatting/format.pipes';
import { FormatService } from '../../../core/formatting/format.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { Trip, TripStatus, VEHICLE_TYPES, VehicleType } from '../../../core/models';
import { ClockService } from '../../../core/services/clock.service';
import { EntityDirectory } from '../../../core/services/entity-directory.service';
import { TripWorkflowService } from '../../../core/services/trip-workflow.service';
import { ConfirmService } from '../../../shared/ui/confirm-dialog/confirm.service';
import { EmptyState } from '../../../shared/ui/empty-state/empty-state';
import { Icon } from '../../../shared/ui/icon/icon';
import { KpiCard } from '../../../shared/ui/kpi-card/kpi-card';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { ToastService } from '../../../shared/ui/toast/toast.service';
import { createListState } from '../../../shared/utils/list-state';
import { DelayReasonDialog } from '../delay-reason-dialog/delay-reason-dialog';
import { DispatchCard } from '../dispatch-card/dispatch-card';
import {
  BOARD_COLUMNS,
  BoardColumn,
  CORRIDORS,
  Corridor,
  columnOf,
  columnStatus,
  compareInColumn,
  corridorOf,
  dispatchSummary,
  dropTargets,
} from '../dispatch-board';

interface DragState {
  trip: Trip;
  from: BoardColumn;
  targets: readonly BoardColumn[];
  /** Column under the pointer. */
  over: BoardColumn | null;
  dropped: boolean;
}

@Component({
  selector: 'app-dispatch-page',
  imports: [RouterLink, TranslatePipe, ...FORMAT_PIPES, PageHeader, KpiCard, EmptyState, Icon, DispatchCard, DelayReasonDialog],
  templateUrl: './dispatch-page.html',
  styleUrl: './dispatch-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DispatchPage {
  private readonly repository = inject(TripRepository);
  private readonly workflow = inject(TripWorkflowService);
  private readonly clock = inject(ClockService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly i18n = inject(TranslationService);
  private readonly format = inject(FormatService);
  protected readonly directory = inject(EntityDirectory);

  protected readonly columns = BOARD_COLUMNS;
  protected readonly corridors = CORRIDORS;
  protected readonly vehicleTypes = VEHICLE_TYPES;
  protected readonly list = createListState({ debounceMs: 200 });
  protected readonly customerFilter = signal<string | null>(null);
  protected readonly vehicleTypeFilter = signal<VehicleType | null>(null);
  protected readonly corridorFilter = signal<Corridor | null>(null);
  /** Column shown on tablet / mobile, where one column is visible at a time. */
  protected readonly activeColumn = signal<BoardColumn>('in_transit');

  protected readonly drag = signal<DragState | null>(null);
  protected readonly moving = signal<ReadonlySet<string>>(new Set());
  protected readonly delayTarget = signal<Trip | null>(null);
  protected readonly delaySaving = signal(false);
  protected readonly announcement = signal('');

  protected readonly query = createQuery(
    () => this.repository.changes(),
    () => this.repository.all(),
  );

  protected readonly today = this.clock.today();

  protected readonly subtitle = computed(() => this.i18n.t('dispatch.subtitle', { date: this.format.date(this.today, 'long') }));

  private readonly allTrips = computed(() => this.query.value() ?? []);

  protected readonly summary = computed(() => dispatchSummary(this.allTrips(), this.today));

  protected readonly customerOptions = computed(() =>
    [...new Set(this.allTrips().map((trip) => trip.customerId))]
      .map((id) => ({ id, label: this.directory.customerName(id) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  protected readonly hasFilters = computed(
    () => this.list.hasSearch() || !!this.customerFilter() || !!this.vehicleTypeFilter() || !!this.corridorFilter(),
  );

  private readonly filteredTrips = computed(() => {
    const search = this.list.search();
    const customer = this.customerFilter();
    const vehicleType = this.vehicleTypeFilter();
    const corridor = this.corridorFilter();
    return this.allTrips().filter((trip) => {
      if (customer && trip.customerId !== customer) return false;
      if (corridor && corridorOf(trip) !== corridor) return false;
      const vehicle = this.directory.vehicle(trip.vehicleId);
      if (vehicleType && vehicle?.type !== vehicleType) return false;
      return matchesSearch(search, [
        trip.reference,
        trip.origin.city,
        trip.destination.city,
        trip.customerReference,
        vehicle?.plateNumber,
        this.directory.driverName(trip.driverId),
        this.directory.customerName(trip.customerId),
        trip.cargo.containerRef,
      ]);
    });
  });

  protected readonly board = computed(() => {
    const buckets = new Map<BoardColumn, Trip[]>(BOARD_COLUMNS.map((column) => [column, []]));
    for (const trip of this.filteredTrips()) {
      const column = columnOf(trip, this.today);
      if (column) buckets.get(column)!.push(trip);
    }
    for (const [column, trips] of buckets) trips.sort((a, b) => compareInColumn(column, a, b));
    return buckets;
  });

  protected readonly visibleCount = computed(() => [...this.board().values()].reduce((sum, trips) => sum + trips.length, 0));

  protected clearFilters(): void {
    this.list.clearSearch();
    this.customerFilter.set(null);
    this.vehicleTypeFilter.set(null);
    this.corridorFilter.set(null);
  }

  protected setCustomer(event: Event): void {
    this.customerFilter.set((event.target as HTMLSelectElement).value || null);
  }

  protected setVehicleType(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as VehicleType;
    this.vehicleTypeFilter.set(VEHICLE_TYPES.includes(value) ? value : null);
  }

  protected setCorridor(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as Corridor;
    this.corridorFilter.set(CORRIDORS.includes(value) ? value : null);
  }

  protected onColumnPickerKeydown(event: KeyboardEvent, index: number): void {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = BOARD_COLUMNS[(index + delta + BOARD_COLUMNS.length) % BOARD_COLUMNS.length];
    this.activeColumn.set(next);
    queueMicrotask(() => document.getElementById(`dispatch-pick-${next}`)?.focus());
  }

  protected isMoving(trip: Trip): boolean {
    return this.moving().has(trip.id);
  }

  // ---- Status changes (menu and drag & drop share this path) ----

  protected async requestMove(trip: Trip, status: TripStatus): Promise<void> {
    if (this.isMoving(trip)) return;
    if (!canTransition(trip.status, status)) {
      this.rejectMove(trip, status);
      return;
    }
    if (status === 'delayed') {
      this.delayTarget.set(trip);
      return;
    }
    if (status === 'cancelled') {
      const confirmed = await this.confirm.ask({
        title: this.i18n.t('dispatch.confirmCancel.title', { reference: trip.reference }),
        message: this.i18n.t('dispatch.confirmCancel.message'),
        confirmLabel: this.i18n.t('dispatch.confirmCancel.confirm'),
      });
      if (!confirmed) return;
    }
    await this.applyMove(trip, status, null);
  }

  protected async confirmDelay(reason: string): Promise<void> {
    const trip = this.delayTarget();
    if (!trip) return;
    this.delaySaving.set(true);
    const ok = await this.applyMove(trip, 'delayed', reason);
    this.delaySaving.set(false);
    if (ok) this.delayTarget.set(null);
  }

  private async applyMove(trip: Trip, status: TripStatus, delayReason: string | null): Promise<boolean> {
    this.moving.update((set) => new Set(set).add(trip.id));
    const from = this.i18n.t(`trips.status.${trip.status}`);
    const to = this.i18n.t(`trips.status.${status}`);
    try {
      await this.workflow.changeStatus(trip.id, status, this.i18n.t('dispatch.notes.moved'), delayReason);
      this.toast.success(this.i18n.t('dispatch.toasts.moved', { reference: trip.reference, status: to }));
      this.announce(this.i18n.t('dispatch.announce.moved', { reference: trip.reference, from, to }));
      return true;
    } catch {
      this.toast.error(this.i18n.t('dispatch.toasts.error', { reference: trip.reference }));
      return false;
    } finally {
      this.moving.update((set) => {
        const next = new Set(set);
        next.delete(trip.id);
        return next;
      });
    }
  }

  private rejectMove(trip: Trip, status: TripStatus): void {
    const message = this.i18n.t('dispatch.drag.invalidToast', {
      reference: trip.reference,
      from: this.i18n.t(`trips.status.${trip.status}`),
      to: this.i18n.t(`trips.status.${status}`),
    });
    this.toast.warning(message);
    this.announce(message);
  }

  // ---- Native drag and drop (progressive enhancement) ----

  protected onDragStart(trip: Trip, from: BoardColumn): void {
    const targets = dropTargets(trip);
    this.drag.set({ trip, from, targets, over: null, dropped: false });
    const names = targets.map((column) => this.i18n.t(`dispatch.columns.${column}`)).join(', ');
    this.announce(
      targets.length
        ? this.i18n.t('dispatch.announce.dragStart', { reference: trip.reference, targets: names })
        : this.i18n.t('dispatch.announce.dragNoTargets', { reference: trip.reference }),
    );
  }

  protected onDragEnd(): void {
    const state = this.drag();
    this.drag.set(null);
    // Dropping on a column that does not accept the trip never fires `drop`: explain why here.
    if (state && !state.dropped && state.over && state.over !== state.from && !state.targets.includes(state.over)) {
      this.rejectMove(state.trip, columnStatus(state.over));
    }
  }

  protected onDragOver(event: DragEvent, column: BoardColumn): void {
    const state = this.drag();
    if (!state) return;
    if (state.over !== column) this.drag.set({ ...state, over: column });
    if (state.targets.includes(column)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    } else if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'none';
    }
  }

  protected onDragLeave(event: DragEvent, column: BoardColumn): void {
    const state = this.drag();
    const related = event.relatedTarget as Node | null;
    if (!state || state.over !== column) return;
    if (related && (event.currentTarget as HTMLElement).contains(related)) return;
    this.drag.set({ ...state, over: null });
  }

  protected onDrop(event: DragEvent, column: BoardColumn): void {
    event.preventDefault();
    const state = this.drag();
    if (!state) return;
    this.drag.set({ ...state, dropped: true, over: column });
    if (column === state.from) return;
    void this.requestMove(state.trip, columnStatus(column));
  }

  protected dropState(column: BoardColumn): 'valid' | 'invalid' | 'source' | null {
    const state = this.drag();
    if (!state) return null;
    if (column === state.from) return 'source';
    return state.targets.includes(column) ? 'valid' : 'invalid';
  }

  private announce(message: string): void {
    // Reset first so repeating the same message is announced again.
    this.announcement.set('');
    queueMicrotask(() => this.announcement.set(message));
  }
}
