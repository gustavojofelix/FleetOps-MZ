import { addDays, dateOfTimestamp } from '../../core/formatting/date-utils';
import { canTransition } from '../../core/domain/trip-rules';
import { ACTIVE_TRIP_STATUSES, IsoDate, Trip, TripStatus } from '../../core/models';

/*
 * Pure dispatch-board rules: which column a trip belongs to, which columns accept it, and the
 * summary figures shown above the board.
 */

export type BoardColumn = 'planned' | 'preparing' | 'in_transit' | 'delayed' | 'delivered';
export type Corridor = 'cross_border' | 'domestic';

export const BOARD_COLUMNS: readonly BoardColumn[] = ['planned', 'preparing', 'in_transit', 'delayed', 'delivered'];
export const CORRIDORS: readonly Corridor[] = ['cross_border', 'domestic'];

/** Delivered trips stay on the board for this many days (today included). */
export const DELIVERED_WINDOW_DAYS = 7;

export function arrivalDate(trip: Trip): IsoDate {
  return dateOfTimestamp(trip.actualArrival ?? trip.plannedArrival);
}

/** Board column for a trip, or null when it is not shown (cancelled, or delivered long ago). */
export function columnOf(trip: Trip, today: IsoDate): BoardColumn | null {
  switch (trip.status) {
    case 'planned':
    case 'preparing':
    case 'in_transit':
    case 'delayed':
      return trip.status;
    case 'delivered':
    case 'completed':
      return arrivalDate(trip) >= addDays(today, -(DELIVERED_WINDOW_DAYS - 1)) ? 'delivered' : null;
    default:
      return null;
  }
}

/** The trip status a column stands for when a card is dropped on it. */
export function columnStatus(column: BoardColumn): TripStatus {
  return column;
}

/** Columns a trip may be dropped on (allowed transitions only). */
export function dropTargets(trip: Pick<Trip, 'status'>): BoardColumn[] {
  return BOARD_COLUMNS.filter((column) => canTransition(trip.status, columnStatus(column)));
}

export function corridorOf(trip: Pick<Trip, 'origin' | 'destination'>): Corridor {
  return trip.origin.country !== trip.destination.country ? 'cross_border' : 'domestic';
}

/** Sort order inside a column: what needs attention first. */
export function compareInColumn(column: BoardColumn, a: Trip, b: Trip): number {
  switch (column) {
    case 'planned':
    case 'preparing':
      return a.plannedDeparture.localeCompare(b.plannedDeparture);
    case 'in_transit':
    case 'delayed':
      return a.plannedArrival.localeCompare(b.plannedArrival);
    case 'delivered':
      return (b.actualArrival ?? b.plannedArrival).localeCompare(a.actualArrival ?? a.plannedArrival);
  }
}

export interface DispatchSummary {
  active: number;
  delayed: number;
  departuresToday: number;
  departedToday: number;
  arrivalsToday: number;
  arrivedToday: number;
}

export function dispatchSummary(trips: readonly Trip[], today: IsoDate): DispatchSummary {
  const summary: DispatchSummary = { active: 0, delayed: 0, departuresToday: 0, departedToday: 0, arrivalsToday: 0, arrivedToday: 0 };
  for (const trip of trips) {
    if (trip.status === 'cancelled') continue;
    if (ACTIVE_TRIP_STATUSES.includes(trip.status)) summary.active++;
    if (trip.status === 'delayed') summary.delayed++;
    if (dateOfTimestamp(trip.plannedDeparture) === today) {
      summary.departuresToday++;
      if (trip.actualDeparture) summary.departedToday++;
    }
    if (dateOfTimestamp(trip.plannedArrival) === today) {
      summary.arrivalsToday++;
      if (trip.actualArrival) summary.arrivedToday++;
    }
  }
  return summary;
}
